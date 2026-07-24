// A minimal in-memory stand-in for `prisma.schedule` used by the race/duplicate
// tests. It intentionally mirrors Postgres's guarantee for a single
// `UPDATE ... WHERE ...` statement: `updateMany` checks its predicate and
// mutates matching rows with no `await` in between, so it is indivisible with
// respect to other calls made from the same event loop turn. This lets tests
// simulate two "concurrent" claim attempts (via Promise.all) and assert that
// exactly one of them wins the row, the way a real atomic conditional UPDATE
// would guarantee against two overlapping cron invocations.

export interface FakeScheduleRow {
  id: string;
  userId: string;
  owner: string;
  repo: string;
  repoFullName: string;
  workflowName: string;
  workflowPath: string;
  inputs: Record<string, string>;
  ref: string;
  scheduledAt: Date;
  timezone: string;
  status: string;
  triggeredAt: Date | null;
  errorMessage: string | null;
  accessToken: string;
  createdAt: Date;
}

type Where = Record<string, unknown>;
type Select = Record<string, boolean> | undefined;

function matches(row: FakeScheduleRow, where: Where): boolean {
  return Object.entries(where).every(([key, condition]) => {
    const value = row[key as keyof FakeScheduleRow];
    if (condition && typeof condition === "object" && "lte" in condition) {
      return (value as Date) <= (condition as { lte: Date }).lte;
    }
    return value === condition;
  });
}

function project(row: FakeScheduleRow, select: Select) {
  if (!select) return { ...row };
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(select)) {
    if (select[key]) result[key] = row[key as keyof FakeScheduleRow];
  }
  return result;
}

export function makeScheduleRow(overrides: Partial<FakeScheduleRow> = {}): FakeScheduleRow {
  return {
    id: "schedule-1",
    userId: "user-1",
    owner: "octo-org",
    repo: "octo-repo",
    repoFullName: "octo-org/octo-repo",
    workflowName: "CI",
    workflowPath: ".github/workflows/ci.yml",
    inputs: {},
    ref: "main",
    scheduledAt: new Date("2026-07-24T00:00:00Z"),
    timezone: "UTC",
    status: "pending",
    triggeredAt: null,
    errorMessage: null,
    accessToken: "enc:ghp_token",
    createdAt: new Date("2026-07-01T00:00:00Z"),
    ...overrides,
  };
}

export function createFakeScheduleStore(initialRows: FakeScheduleRow[] = []) {
  let rows = new Map(initialRows.map((r) => [r.id, { ...r }]));

  return {
    seed(newRows: FakeScheduleRow[]) {
      rows = new Map(newRows.map((r) => [r.id, { ...r }]));
    },
    rowsSnapshot() {
      return [...rows.values()].map((r) => ({ ...r }));
    },
    async findMany({ where, select }: { where: Where; select?: Select }) {
      return [...rows.values()].filter((r) => matches(r, where)).map((r) => project(r, select));
    },
    async updateMany({ where, data }: { where: Where; data: Partial<FakeScheduleRow> }) {
      let count = 0;
      for (const row of rows.values()) {
        if (matches(row, where)) {
          Object.assign(row, data);
          count++;
        }
      }
      return { count };
    },
    async findUniqueOrThrow({ where, select }: { where: { id: string }; select?: Select }) {
      const row = rows.get(where.id);
      if (!row) throw new Error(`Schedule ${where.id} not found`);
      return project(row, select);
    },
    async findUnique({ where }: { where: { id: string } }) {
      const row = rows.get(where.id);
      return row ? project(row, undefined) : null;
    },
  };
}

export type FakeScheduleStore = ReturnType<typeof createFakeScheduleStore>;
