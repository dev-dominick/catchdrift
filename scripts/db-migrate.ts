import "dotenv/config";
import { readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";

type Journal = {
  entries: Array<{
    tag: string;
    when: number;
  }>;
};

function splitStatements(sql: string): string[] {
  return sql
    .split("--> statement-breakpoint")
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0);
}

const MIGRATION_LOCK_ID = 42424001;

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required for migrations");
  }

  const client = new Client({ connectionString });
  await client.connect();

  try {
    const journalPath = path.resolve("src/db/migrations/meta/_journal.json");
    const migrationRoot = path.resolve("src/db/migrations");

    const journal = JSON.parse(readFileSync(journalPath, "utf8")) as Journal;

    await client.query("select pg_advisory_lock($1)", [MIGRATION_LOCK_ID]);

    await client.query(`
      create table if not exists __drizzle_migrations (
        id serial primary key,
        hash text not null unique,
        created_at bigint not null
      )
    `);

    for (const entry of journal.entries) {
      const migrationId = entry.tag;
      const exists = await client.query<{ hash: string }>(
        `select hash from __drizzle_migrations where hash = $1 limit 1`,
        [migrationId],
      );

      if (exists.rowCount && exists.rowCount > 0) {
        continue;
      }

      const sqlPath = path.join(migrationRoot, `${migrationId}.sql`);
      const sql = readFileSync(sqlPath, "utf8");
      const statements = splitStatements(sql);

      try {
        await client.query("begin");
        for (const statement of statements) {
          await client.query(statement);
        }
        await client.query(
          `insert into __drizzle_migrations (hash, created_at) values ($1, $2)`,
          [migrationId, entry.when],
        );
        await client.query("commit");
      } catch (error) {
        await client.query("rollback");
        throw new Error(
          `Migration ${migrationId} failed: ${error instanceof Error ? error.message : "unknown error"}`,
        );
      }

      console.log(`Applied migration ${migrationId}`);
    }

    console.log("Migrations applied successfully");
  } finally {
    try {
      await client.query("select pg_advisory_unlock($1)", [MIGRATION_LOCK_ID]);
    } catch {
      // Ignore unlock failures on teardown.
    }
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
