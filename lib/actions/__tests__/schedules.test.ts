import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeScheduleStore, makeScheduleRow } from "./fake-schedule-store";
import type { FakeScheduleStore } from "./fake-schedule-store";
import type { SchedulePayload } from "@/types/schedule";
import type { Session } from "next-auth";

const { fakeStore } = vi.hoisted(() => ({
  fakeStore: { schedule: null as unknown as FakeScheduleStore },
}));

vi.mock("@/lib/db", () => ({ prisma: fakeStore }));
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/auth/access-token", () => ({ getGitHubAccessToken: vi.fn() }));
vi.mock("@/lib/crypto", () => ({
  encrypt: (value: string) => `enc:${value}`,
  decrypt: (value: string) => value.replace(/^enc:/, ""),
}));

import { auth } from "@/auth";
import { getGitHubAccessToken } from "@/lib/auth/access-token";
import {
  claimSchedule,
  getDueScheduleIds,
  getSchedules,
  updateSchedule,
  updateScheduleStatus,
  getUnresolvedSchedules,
  getLinkedRunIds,
  linkScheduleRun,
  setRunConclusion,
  timeoutUnresolvedSchedules,
} from "@/lib/actions/schedules";

const NOW = new Date("2026-07-24T12:00:00Z");
const PAST = new Date("2026-07-24T11:00:00Z");
const FUTURE = new Date("2026-07-25T00:00:00Z");

// next-auth v5's `auth` export is overloaded (plain session fetch, middleware,
// route handler wrapper); narrow to the plain-fetch signature we actually use
// so vi.mocked() picks the right overload instead of the middleware one.
const getSession = auth as unknown as () => Promise<Session | null>;

function mockSession() {
  const session: Session = {
    expires: "2099-01-01T00:00:00.000Z",
    user: { id: "user-1" },
  };
  vi.mocked(getSession).mockResolvedValue(session);
  // The access token is read from the JWT rather than the session, so it is
  // mocked separately -- see lib/auth/access-token.ts.
  vi.mocked(getGitHubAccessToken).mockResolvedValue("fresh-token");
}

function makePayload(overrides: Partial<SchedulePayload> = {}): SchedulePayload {
  return {
    repository: { owner: "octo-org", name: "octo-repo", fullName: "octo-org/octo-repo" },
    workflow: { name: "CI", path: ".github/workflows/ci.yml" },
    inputs: {},
    scheduledAt: FUTURE.toISOString(),
    timezone: "UTC",
    ...overrides,
  };
}

beforeEach(() => {
  fakeStore.schedule = createFakeScheduleStore();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("getDueScheduleIds", () => {
  it("only returns pending rows that are already due", async () => {
    fakeStore.schedule = createFakeScheduleStore([
      makeScheduleRow({ id: "due-pending", status: "pending", scheduledAt: PAST }),
      makeScheduleRow({ id: "future-pending", status: "pending", scheduledAt: FUTURE }),
      makeScheduleRow({ id: "due-processing", status: "processing", scheduledAt: PAST }),
      makeScheduleRow({ id: "due-triggered", status: "triggered", scheduledAt: PAST }),
    ]);

    const ids = await getDueScheduleIds(NOW);

    expect(ids).toEqual(["due-pending"]);
  });
});

describe("claimSchedule", () => {
  it("atomically claims a pending, due schedule and returns fresh fields", async () => {
    fakeStore.schedule = createFakeScheduleStore([
      makeScheduleRow({ id: "s1", status: "pending", scheduledAt: PAST, owner: "octo-org" }),
    ]);

    const claimed = await claimSchedule("s1", NOW);

    expect(claimed).not.toBeNull();
    expect(claimed?.owner).toBe("octo-org");
    const rows = fakeStore.schedule.rowsSnapshot();
    expect(rows.find((r) => r.id === "s1")?.status).toBe("processing");
  });

  it("returns null when the row is no longer pending (already claimed)", async () => {
    fakeStore.schedule = createFakeScheduleStore([
      makeScheduleRow({ id: "s1", status: "processing", scheduledAt: PAST }),
    ]);

    const claimed = await claimSchedule("s1", NOW);

    expect(claimed).toBeNull();
  });

  it("returns null when the schedule was rescheduled to the future since the due-list read", async () => {
    fakeStore.schedule = createFakeScheduleStore([
      makeScheduleRow({ id: "s1", status: "pending", scheduledAt: FUTURE }),
    ]);

    const claimed = await claimSchedule("s1", NOW);

    expect(claimed).toBeNull();
  });

  it("dispatches with the latest edited values even if the due-list snapshot predates the edit", async () => {
    fakeStore.schedule = createFakeScheduleStore([
      makeScheduleRow({
        id: "s1",
        status: "pending",
        scheduledAt: PAST,
        workflowPath: ".github/workflows/old.yml",
      }),
    ]);
    mockSession();

    // Cron reads the due list first (stale snapshot)...
    const dueIds = await getDueScheduleIds(NOW);
    expect(dueIds).toEqual(["s1"]);

    // ...then the user's edit lands while the row is still pending...
    const editResult = await updateSchedule("s1", {
      payload: makePayload({
        workflow: { name: "Deploy", path: ".github/workflows/new.yml" },
        scheduledAt: PAST.toISOString(),
      }),
    });
    expect(editResult.success).toBe(true);

    // ...and only now does cron claim + dispatch. It must use the edited value.
    const claimed = await claimSchedule(dueIds[0], NOW);
    expect(claimed?.workflowPath).toBe(".github/workflows/new.yml");
  });

  it("lets exactly one of two concurrent claim attempts win the same schedule", async () => {
    fakeStore.schedule = createFakeScheduleStore([
      makeScheduleRow({ id: "s1", status: "pending", scheduledAt: PAST }),
    ]);

    const [a, b] = await Promise.all([claimSchedule("s1", NOW), claimSchedule("s1", NOW)]);
    const winners = [a, b].filter((result) => result !== null);

    expect(winners).toHaveLength(1);
  });
});

describe("updateSchedule", () => {
  it("edits a pending schedule", async () => {
    fakeStore.schedule = createFakeScheduleStore([
      makeScheduleRow({ id: "s1", status: "pending", owner: "old-owner" }),
    ]);
    mockSession();

    const result = await updateSchedule("s1", {
      payload: makePayload({
        repository: { owner: "new-owner", name: "repo", fullName: "new-owner/repo" },
      }),
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.schedule.owner).toBe("new-owner");
    }
  });

  it("rejects edits once a schedule has been claimed for processing", async () => {
    fakeStore.schedule = createFakeScheduleStore([
      makeScheduleRow({ id: "s1", status: "pending", scheduledAt: PAST }),
    ]);
    mockSession();

    const claimed = await claimSchedule("s1", NOW);
    expect(claimed).not.toBeNull();

    const result = await updateSchedule("s1", { payload: makePayload() });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/no longer pending/i);
    }
  });

  it("rejects edits to a schedule that already reached a terminal state", async () => {
    fakeStore.schedule = createFakeScheduleStore([
      makeScheduleRow({ id: "s1", status: "triggered" }),
    ]);
    mockSession();

    const result = await updateSchedule("s1", { payload: makePayload() });

    expect(result.success).toBe(false);
  });
});

describe("updateScheduleStatus", () => {
  it("moves a claimed schedule to a terminal state", async () => {
    fakeStore.schedule = createFakeScheduleStore([
      makeScheduleRow({ id: "s1", status: "processing" }),
    ]);

    const result = await updateScheduleStatus("s1", "triggered");

    expect(result.count).toBe(1);
    const rows = fakeStore.schedule.rowsSnapshot();
    expect(rows.find((r) => r.id === "s1")?.status).toBe("triggered");
  });

  it("is a no-op if the row is not in processing (guards against double transitions)", async () => {
    fakeStore.schedule = createFakeScheduleStore([
      makeScheduleRow({ id: "s1", status: "triggered" }),
    ]);

    const result = await updateScheduleStatus("s1", "failed", "should not apply");

    expect(result.count).toBe(0);
    const rows = fakeStore.schedule.rowsSnapshot();
    expect(rows.find((r) => r.id === "s1")?.status).toBe("triggered");
  });
});

describe("run result fields", () => {
  it("getSchedules exposes runUrl and runConclusion", async () => {
    mockSession();
    fakeStore.schedule = createFakeScheduleStore([
      makeScheduleRow({
        id: "s1",
        status: "triggered",
        runId: 123n,
        runUrl: "https://github.com/octo-org/octo-repo/actions/runs/123",
        runConclusion: "success",
      }),
    ]);

    const result = await getSchedules();

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.schedules[0].runUrl).toBe(
      "https://github.com/octo-org/octo-repo/actions/runs/123"
    );
    expect(result.schedules[0].runConclusion).toBe("success");
  });
});

describe("fake store comparison operators", () => {
  const T0 = new Date("2026-07-24T00:00:00Z");
  const T1 = new Date("2026-07-24T01:00:00Z");
  const T2 = new Date("2026-07-24T02:00:00Z");

  it("supports gte and lt on Date fields", async () => {
    const store = createFakeScheduleStore([
      makeScheduleRow({ id: "old", triggeredAt: T0 }),
      makeScheduleRow({ id: "mid", triggeredAt: T1 }),
      makeScheduleRow({ id: "new", triggeredAt: T2 }),
    ]);

    const gte = await store.findMany({ where: { triggeredAt: { gte: T1 } }, select: { id: true } });
    expect(gte.map((r) => r.id).sort()).toEqual(["mid", "new"]);

    const lt = await store.findMany({ where: { triggeredAt: { lt: T1 } }, select: { id: true } });
    expect(lt.map((r) => r.id)).toEqual(["old"]);
  });

  it("a null field never matches a comparison operator", async () => {
    const store = createFakeScheduleStore([
      makeScheduleRow({ id: "never-triggered", triggeredAt: null }),
    ]);

    const rows = await store.findMany({ where: { triggeredAt: { gte: T0 } }, select: { id: true } });
    expect(rows).toEqual([]);
  });
});

describe("resolution pass helpers", () => {
  const CUTOFF = new Date("2026-07-23T12:00:00Z"); // now − 24h
  const RECENT = new Date("2026-07-24T11:00:00Z");
  const STALE = new Date("2026-07-22T11:00:00Z");

  it("getUnresolvedSchedules returns triggered rows without a conclusion inside the window, oldest first", async () => {
    fakeStore.schedule = createFakeScheduleStore([
      makeScheduleRow({ id: "newer", status: "triggered", triggeredAt: RECENT }),
      makeScheduleRow({
        id: "older",
        status: "triggered",
        triggeredAt: new Date("2026-07-24T10:00:00Z"),
      }),
      makeScheduleRow({ id: "stale", status: "triggered", triggeredAt: STALE }),
      makeScheduleRow({
        id: "done",
        status: "triggered",
        triggeredAt: RECENT,
        runConclusion: "success",
      }),
      makeScheduleRow({ id: "pending", status: "pending", triggeredAt: null }),
      makeScheduleRow({ id: "failed", status: "failed", triggeredAt: null }),
    ]);

    const unresolved = await getUnresolvedSchedules(CUTOFF);

    expect(unresolved.map((s) => s.id)).toEqual(["older", "newer"]);
    expect(unresolved[0].accessToken).toBe("enc:ghp_token");
  });

  it("getLinkedRunIds returns run ids already claimed for a workflow", async () => {
    fakeStore.schedule = createFakeScheduleStore([
      makeScheduleRow({ id: "a", status: "triggered", runId: 100n }),
      makeScheduleRow({ id: "b", status: "triggered", runId: null }),
      makeScheduleRow({
        id: "other-workflow",
        status: "triggered",
        runId: 200n,
        workflowPath: ".github/workflows/deploy.yml",
      }),
    ]);

    const linked = await getLinkedRunIds("octo-org/octo-repo", ".github/workflows/ci.yml");

    expect(linked).toEqual(new Set([100]));
  });

  it("linkScheduleRun stores the run and won't overwrite an existing link", async () => {
    fakeStore.schedule = createFakeScheduleStore([
      makeScheduleRow({ id: "s1", status: "triggered", triggeredAt: RECENT }),
    ]);

    const first = await linkScheduleRun("s1", 100, "https://github.com/o/r/actions/runs/100", null);
    expect(first.count).toBe(1);

    const second = await linkScheduleRun("s1", 999, "https://example.com", null);
    expect(second.count).toBe(0);

    const row = fakeStore.schedule.rowsSnapshot()[0];
    expect(row.runId).toBe(100n);
    expect(row.runUrl).toBe("https://github.com/o/r/actions/runs/100");
  });

  it("linkScheduleRun can store a conclusion when the run already completed", async () => {
    fakeStore.schedule = createFakeScheduleStore([
      makeScheduleRow({ id: "s1", status: "triggered", triggeredAt: RECENT }),
    ]);

    await linkScheduleRun("s1", 100, "https://github.com/o/r/actions/runs/100", "success");

    expect(fakeStore.schedule.rowsSnapshot()[0].runConclusion).toBe("success");
  });

  it("setRunConclusion resolves a schedule exactly once", async () => {
    fakeStore.schedule = createFakeScheduleStore([
      makeScheduleRow({ id: "s1", status: "triggered", triggeredAt: RECENT, runId: 100n }),
    ]);

    const first = await setRunConclusion("s1", "failure");
    expect(first.count).toBe(1);

    const second = await setRunConclusion("s1", "success");
    expect(second.count).toBe(0);

    expect(fakeStore.schedule.rowsSnapshot()[0].runConclusion).toBe("failure");
  });

  it("timeoutUnresolvedSchedules marks only stale unresolved rows as unknown", async () => {
    fakeStore.schedule = createFakeScheduleStore([
      makeScheduleRow({ id: "stale", status: "triggered", triggeredAt: STALE }),
      makeScheduleRow({ id: "recent", status: "triggered", triggeredAt: RECENT }),
      makeScheduleRow({
        id: "stale-but-done",
        status: "triggered",
        triggeredAt: STALE,
        runConclusion: "success",
      }),
    ]);

    const result = await timeoutUnresolvedSchedules(CUTOFF);

    expect(result.count).toBe(1);
    const rows = new Map(fakeStore.schedule.rowsSnapshot().map((r) => [r.id, r]));
    expect(rows.get("stale")!.runConclusion).toBe("unknown");
    expect(rows.get("recent")!.runConclusion).toBeNull();
    expect(rows.get("stale-but-done")!.runConclusion).toBe("success");
  });
});
