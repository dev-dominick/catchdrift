import "dotenv/config";
import { readFileSync } from "node:fs";
import path from "node:path";
import { Pool } from "pg";

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

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required for migrations");
  }

  const pool = new Pool({ connectionString });

  try {
    const journalPath = path.resolve("src/db/migrations/meta/_journal.json");
    const migrationRoot = path.resolve("src/db/migrations");

    const journal = JSON.parse(readFileSync(journalPath, "utf8")) as Journal;

    await pool.query(`
      create table if not exists __drizzle_migrations (
        id serial primary key,
        hash text not null unique,
        created_at bigint not null
      )
    `);

    for (const entry of journal.entries) {
      const migrationId = entry.tag;
      const exists = await pool.query<{ hash: string }>(
        `select hash from __drizzle_migrations where hash = $1 limit 1`,
        [migrationId],
      );

      if (exists.rowCount && exists.rowCount > 0) {
        continue;
      }

      const sqlPath = path.join(migrationRoot, `${migrationId}.sql`);
      const sql = readFileSync(sqlPath, "utf8");
      const statements = splitStatements(sql);

      const client = await pool.connect();
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
        throw error;
      } finally {
        client.release();
      }

      console.log(`Applied migration ${migrationId}`);
    }

    console.log("Migrations applied successfully");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
