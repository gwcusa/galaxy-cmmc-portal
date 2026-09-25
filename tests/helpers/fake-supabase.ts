/**
 * In-memory stand-in for the supabase-js client, covering exactly the query
 * surface the gated routes and lib/licensing.ts use:
 *
 *   from(table).select(cols).eq/neq/not/is/in/gt/lte/order/limit/single/maybeSingle
 *   from(table).insert(rows).select(cols).single()
 *   from(table).upsert(row, { onConflict })
 *   from(table).update(patch).eq(...)
 *   from(table).delete().eq(...)
 *   auth.admin.getUserById(id)
 *
 * Embedded many-to-one selects such as `clients(user_id)` are resolved through
 * RELATIONS. Every builder is a thenable, so `await svc.from(...)...` works.
 */
export type Row = Record<string, unknown>;

export type FakeState = {
  user: { id: string } | null;
  tables: Record<string, Row[]>;
  users: { id: string; email: string }[];
};

const RELATIONS: Record<string, Record<string, { table: string; localKey: string }>> = {
  assessments: { clients: { table: "clients", localKey: "client_id" } },
  artifacts: { assessments: { table: "assessments", localKey: "assessment_id" } },
  client_licenses: {
    packages: { table: "packages", localKey: "package_id" },
    clients: { table: "clients", localKey: "client_id" },
  },
  documents: { clients: { table: "clients", localKey: "client_id" } },
};

/** Column defaults the database would apply on insert. */
const DEFAULTS: Record<string, () => Row> = {
  assessments: () => ({ status: "in_progress", started_at: new Date().toISOString() }),
};

function splitTopLevel(select: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of select) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function project(state: FakeState, table: string, row: Row, select: string): Row {
  const out: Row = { ...row };
  for (const part of splitTopLevel(select)) {
    const match = part.match(/^(\w+)\(([\s\S]*)\)$/);
    if (!match) continue;
    const rel = RELATIONS[table]?.[match[1]];
    if (!rel) {
      out[match[1]] = null;
      continue;
    }
    const target = (state.tables[rel.table] ?? []).find((r) => r.id === row[rel.localKey]);
    out[match[1]] = target ? project(state, rel.table, target, match[2]) : null;
  }
  return out;
}

type Filter = (row: Row) => boolean;

export type FakeResult = {
  data: unknown;
  error: { message: string; code?: string } | null;
  count?: number | null;
};

class FakeQuery implements PromiseLike<FakeResult> {
  private filters: Filter[] = [];
  private op: "select" | "insert" | "upsert" | "update" | "delete" = "select";
  private payload: Row | Row[] | null = null;
  private conflictKeys: string[] = ["id"];
  private columns = "*";
  private returning = false;
  private ordering: { column: string; ascending: boolean } | null = null;
  private max: number | null = null;
  private mode: "many" | "single" | "maybe" = "many";
  private headOnly = false;

  constructor(private state: FakeState, private table: string) {}

  select(columns = "*", opts?: { count?: string; head?: boolean }) {
    this.columns = columns;
    this.returning = true;
    if (opts?.head) this.headOnly = true;
    return this;
  }
  insert(rows: Row | Row[]) { this.op = "insert"; this.payload = rows; this.returning = false; return this; }
  upsert(row: Row, opts?: { onConflict?: string }) {
    this.op = "upsert";
    this.payload = row;
    this.conflictKeys = (opts?.onConflict ?? "id").split(",").map((s) => s.trim());
    this.returning = false;
    return this;
  }
  update(patch: Row) { this.op = "update"; this.payload = patch; this.returning = false; return this; }
  delete() { this.op = "delete"; this.returning = false; return this; }

  eq(column: string, value: unknown) { this.filters.push((r) => r[column] === value); return this; }
  neq(column: string, value: unknown) { this.filters.push((r) => r[column] !== value); return this; }
  not(column: string, operator: string, value: unknown) {
    if (operator === "eq") this.filters.push((r) => r[column] !== value);
    return this;
  }
  is(column: string, value: unknown) { this.filters.push((r) => (r[column] ?? null) === value); return this; }
  in(column: string, values: unknown[]) { this.filters.push((r) => values.includes(r[column])); return this; }
  gt(column: string, value: string) { this.filters.push((r) => String(r[column]) > value); return this; }
  lte(column: string, value: string) { this.filters.push((r) => String(r[column]) <= value); return this; }
  order(column: string, opts?: { ascending?: boolean }) {
    this.ordering = { column, ascending: opts?.ascending ?? true };
    return this;
  }
  limit(n: number) { this.max = n; return this; }
  single() { this.mode = "single"; return this; }
  maybeSingle() { this.mode = "maybe"; return this; }

  then<TResult1 = FakeResult, TResult2 = never>(
    onfulfilled?: ((value: FakeResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.run()).then(onfulfilled, onrejected);
  }

  private rows(): Row[] {
    if (!this.state.tables[this.table]) this.state.tables[this.table] = [];
    return this.state.tables[this.table];
  }

  private matching(): Row[] {
    return this.rows().filter((r) => this.filters.every((f) => f(r)));
  }

  private finish(rows: Row[]): FakeResult {
    const projected = rows.map((r) => project(this.state, this.table, r, this.columns));
    if (this.mode === "single") {
      if (projected.length !== 1) {
        return { data: null, error: { message: "JSON object requested, multiple (or no) rows returned", code: "PGRST116" } };
      }
      return { data: projected[0], error: null };
    }
    if (this.mode === "maybe") return { data: projected[0] ?? null, error: null };
    return { data: projected, error: null };
  }

  private run(): FakeResult {
    if (this.op === "insert") {
      const list = (Array.isArray(this.payload) ? this.payload : [this.payload as Row]).map((r) => ({
        id: crypto.randomUUID(),
        created_at: new Date().toISOString(),
        ...(DEFAULTS[this.table]?.() ?? {}),
        ...r,
      }));
      this.rows().push(...list);
      return this.returning ? this.finish(list) : { data: null, error: null };
    }
    if (this.op === "upsert") {
      const row = this.payload as Row;
      const existing = this.rows().find((r) => this.conflictKeys.every((k) => r[k] === row[k]));
      if (existing) Object.assign(existing, row);
      else this.rows().push({ id: crypto.randomUUID(), ...row });
      return { data: null, error: null };
    }
    if (this.op === "update") {
      const hit = this.matching();
      for (const r of hit) Object.assign(r, this.payload as Row);
      return this.returning ? this.finish(hit) : { data: null, error: null };
    }
    if (this.op === "delete") {
      this.state.tables[this.table] = this.rows().filter((r) => !this.filters.every((f) => f(r)));
      return { data: null, error: null };
    }
    let hit = this.matching();
    if (this.ordering) {
      const { column, ascending } = this.ordering;
      hit = [...hit].sort((a, b) => {
        const av = String(a[column]);
        const bv = String(b[column]);
        return (av < bv ? -1 : av > bv ? 1 : 0) * (ascending ? 1 : -1);
      });
    }
    if (this.max !== null) hit = hit.slice(0, this.max);
    if (this.headOnly) return { data: null, error: null, count: hit.length };
    return this.finish(hit);
  }
}

export function createFakeClient(state: FakeState) {
  return {
    from: (table: string) => new FakeQuery(state, table),
    auth: {
      admin: {
        getUserById: async (id: string) => ({
          data: { user: state.users.find((u) => u.id === id) ?? null },
          error: null,
        }),
      },
    },
  };
}
