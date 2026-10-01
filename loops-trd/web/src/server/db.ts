import { Pool, type PoolClient } from "pg";

/** Мінімальний інтерфейс БД: працює і з node-postgres (прод/Supabase), і з PGlite (тести). */
export interface Db {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
  /** Транзакція. Усередині fn використовуйте лише переданий tx. */
  transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T>;
}

/**
 * Виконує fn від імені користувача: роль `authenticated` + request.jwt.claims.
 * Саме так PostgREST/Supabase застосовує RLS, тож політики працюють однаково.
 */
export async function asUser<T>(db: Db, userId: string, fn: (tx: Db) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: userId, role: "authenticated" }),
    ]);
    await tx.query("set local role authenticated");
    return fn(tx);
  });
}

class PgDb implements Db {
  constructor(private readonly pool: Pool) {}

  async query<T>(text: string, params?: unknown[]) {
    const r = await this.pool.query(text, params as unknown[]);
    return { rows: r.rows as T[] };
  }

  async transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const result = await fn(new PgClientDb(client));
      await client.query("commit");
      return result;
    } catch (e) {
      await client.query("rollback").catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }
}

class PgClientDb implements Db {
  constructor(private readonly client: PoolClient) {}
  async query<T>(text: string, params?: unknown[]) {
    const r = await this.client.query(text, params as unknown[]);
    return { rows: r.rows as T[] };
  }
  async transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
    // Вкладена транзакція через savepoint.
    const sp = `sp_${Math.random().toString(36).slice(2, 10)}`;
    await this.client.query(`savepoint ${sp}`);
    try {
      const r = await fn(this);
      await this.client.query(`release savepoint ${sp}`);
      return r;
    } catch (e) {
      await this.client.query(`rollback to savepoint ${sp}`);
      throw e;
    }
  }
}

/**
 * TLS до Postgres. З DATABASE_CA_CERT (PEM-сертифікат Supabase: Project Settings → Database → SSL)
 * сертифікат сервера перевіряється (захист від MITM). Без нього — шифрування без перевірки (лише для тесту).
 */
function sslConfig() {
  if (process.env.DATABASE_SSL === "false") return undefined;
  const ca = process.env.DATABASE_CA_CERT?.replace(/\\n/g, "\n");
  return ca ? { ca, rejectUnauthorized: true } : { rejectUnauthorized: false };
}

const globalForDb = globalThis as unknown as { __loopsDb?: Db };

export function getDb(): Db {
  if (!globalForDb.__loopsDb) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL не задано");
    const pool = new Pool({
      connectionString,
      max: Number(process.env.DATABASE_POOL_MAX || 5),
      ssl: sslConfig(),
    });
    globalForDb.__loopsDb = new PgDb(pool);
  }
  return globalForDb.__loopsDb;
}

/** Для тестів: підміна БД. */
export function setDb(db: Db) {
  globalForDb.__loopsDb = db;
}

export async function one<T>(db: Db, text: string, params?: unknown[]): Promise<T | null> {
  const { rows } = await db.query<T>(text, params);
  return rows[0] ?? null;
}
