import { DatabaseSync } from 'node:sqlite';

interface ShimResult {
  results: unknown[];
  success: true;
  meta: { changes: number; last_row_id?: number };
}

/** Minimal D1Database over Node's built-in SQLite, enough for Drizzle's D1 driver in tests. */
export function createD1(): D1Database & { exec(sql: string): Promise<D1ExecResult> } {
  const db = new DatabaseSync(':memory:');
  const prepare = (sql: string) => {
    let params: unknown[] = [];
    const norm = () =>
      params.map((p) => (typeof p === 'boolean' ? (p ? 1 : 0) : p === undefined ? null : p)) as never[];
    // Like D1: writes report how many rows they changed, reads return their rows.
    const allSync = (): ShimResult => {
      const st = db.prepare(sql);
      if (st.columns().length === 0) {
        const r = st.run(...norm());
        return {
          results: [],
          success: true,
          meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) },
        };
      }
      const rows = st.all(...norm());
      return { results: rows, success: true, meta: { changes: rows.length } };
    };
    const stmt = {
      __allSync: allSync,
      bind(...p: unknown[]) {
        params = p;
        return stmt;
      },
      async all() {
        return allSync();
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
    // Like D1: one transaction that nothing else interleaves with (no awaits inside), and each
    // statement's rows come back (reads included).
    async batch(stmts: Array<{ __allSync: () => ShimResult }>) {
      db.exec('BEGIN');
      try {
        const out = stmts.map((s) => s.__allSync());
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
