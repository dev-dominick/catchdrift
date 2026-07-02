import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { getEnv } from "@/lib/env";

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: getEnv().DATABASE_URL,
      max: 10,
    });

    pool.on("error", (error) => {
      console.error("Postgres pool error", error instanceof Error ? error.message : error);
    });
  }

  return pool;
}

export function getDb() {
  return drizzle(getPool());
}
