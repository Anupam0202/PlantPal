import { DatabaseSync } from 'node:sqlite';

/** Minimal D1Database over Node's built-in SQLite, enough for Drizzle's D1 driver in tests. */
export function createD1(): D1Database & { exec(sql: string): Promise<D1ExecResult> } {
  const db = new DatabaseSync(':memory:');
  const prepare = (sql: string) => {
    let params: unknown[] = [];
    const norm = () =>
      params.map((p) => (typeof p === 'boolean' ? (p ? 1 : 0) : p === undefined ? null : p)) as never[];
    const stmt = {
      bind(...p: unknown[]) {
        params = p;
        return stmt;
      },
      async all() {
        return { results: db.prepare(sql).all(...norm()), success: true, meta: {} };
      },
      async run() {
        const r = db.prepare(sql).run(...norm());
        return {
          results: [],
          success: true,
          meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) },
        };
      },
      async first(col?: string) {
        const row = db.prepare(sql).get(...norm()) as Record<string, unknown> | undefined;
        if (!row) return null;
        return col ? row[col] : row;
      },
      async raw() {
        return (db.prepare(sql).all(...norm()) as Array<Record<string, unknown>>).map((r) =>
          Object.values(r),
        );
      },
    };
    return stmt;
  };
  return {
    prepare,
    async batch(stmts: Array<{ run: () => Promise<unknown> }>) {
      db.exec('BEGIN');
      try {
        const out = [];
        for (const s of stmts) out.push(await s.run());
        db.exec('COMMIT');
        return out;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
    async exec(sql: string) {
      db.exec(sql);
      return { count: 1, duration: 0 };
    },
    dump: async () => new ArrayBuffer(0),
    withSession: () => {
      throw new Error('not supported');
    },
  } as unknown as D1Database & { exec(sql: string): Promise<D1ExecResult> };
}
