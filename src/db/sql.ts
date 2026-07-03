import type { QueryResultRow } from "pg";
import { getPool } from "@/db/client";

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  values: unknown[] = [],
): Promise<T[]> {
  const result = await getPool().query<T>(text, values);
  return result.rows;
}

export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  text: string,
  values: unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(text, values);
  return rows[0] ?? null;
}

export async function withAdvisoryLock<T>(
  lockId: number,
  action: () => Promise<T>,
): Promise<{ acquired: boolean; result?: T }> {
  const client = await getPool().connect();

  try {
    const lockResult = await client.query<{ acquired: boolean }>(
      "select pg_try_advisory_lock($1) as acquired",
      [lockId],
    );

    if (!lockResult.rows[0]?.acquired) {
      return { acquired: false };
    }

    try {
      const result = await action();
      return { acquired: true, result };
    } finally {
      await client.query("select pg_advisory_unlock($1)", [lockId]);
    }
  } finally {
    client.release();
  }
}

export async function withTransaction<T>(
  action: (tx: {
    query: <R extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]) => Promise<R[]>;
    queryOne: <R extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]) => Promise<R | null>;
  }) => Promise<T>,
): Promise<T> {
  type TxQuery = <R extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]) => Promise<R[]>;
  type TxQueryOne = <R extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[],
  ) => Promise<R | null>;

  const client = await getPool().connect();

  try {
    await client.query("begin");

    const tx: { query: TxQuery; queryOne: TxQueryOne } = {
      query: async (text, values = []) => {
        const result = await client.query(text, values);
        return result.rows;
      },
      queryOne: async (text, values = []) => {
        const result = await client.query(text, values);
        return result.rows[0] ?? null;
      },
    };

    const result = await action(tx);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
