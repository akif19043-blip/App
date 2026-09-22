/** The slice of a Postgres connection the services need. */
export interface Queryable {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  /** Run several statements (no parameters), e.g. a migration file. */
  exec(sql: string): Promise<void>;
}

export interface Database extends Queryable {
  /** Run `fn` inside BEGIN/COMMIT; any throw rolls back. */
  transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>;
  /** LISTEN on a channel; resolves to an unsubscribe function. */
  listen(channel: string, onPayload: (payload: string) => void): Promise<() => Promise<void>>;
  close(): Promise<void>;
  readonly kind: "postgres" | "pglite";
}
