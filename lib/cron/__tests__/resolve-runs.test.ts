import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createFakeScheduleStore,
  makeScheduleRow,
} from "@/lib/actions/__tests__/fake-schedule-store";
import type { FakeScheduleStore } from "@/lib/actions/__tests__/fake-schedule-store";

const { fakeStore, listRunsMock, getRunMock } = vi.hoisted(() => ({
  fakeStore: { schedule: null as unknown as FakeScheduleStore },
  listRunsMock: vi.fn(),
  getRunMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ prisma: fakeStore }));
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/crypto", () => ({
  encrypt: (value: string) => `enc:${value}`,
  decrypt: (value: string) => value.replace(/^enc:/, ""),
}));
vi.mock("@/lib/actions/github", () => ({
  listWorkflowRunsWithToken: listRunsMock,
  getWorkflowRunWithToken: getRunMock,
}));

import { resolveTriggeredSchedules } from "@/lib/cron/resolve-runs";

const NOW = new Date("2026-07-24T12:00:00Z");
const RECENT = new Date("2026-07-24T11:00:00Z");
const STALE = new Date("2026-07-22T11:00:00Z");

function makeRun(id: number, overrides: Record<string, unknown> = {}) {
  return {
    id,
    htmlUrl: `https://github.com/o/r/actions/runs/${id}`,
    status: "in_progress",
    conclusion: null,
    createdAt: "2026-07-24T11:00:05Z",
    ...overrides,
  };
}

beforeEach(() => {
  fakeStore.schedule = createFakeScheduleStore();
  listRunsMock.mockReset();
  getRunMock.mockReset();
  listRunsMock.mockResolvedValue({ success: true, runs: [] });
  getRunMock.mockResolvedValue({ success: true, run: makeRun(1) });
});

describe("resolveTriggeredSchedules", () => {
  it("links an unlinked schedule to the oldest matching run", async () => {
    fakeStore.schedule = createFakeScheduleStore([
      makeScheduleRow({ id: "s1", status: "triggered", triggeredAt: RECENT }),
    ]);
    listRunsMock.mockResolvedValue({
      success: true,
      runs: [
        makeRun(20, { createdAt: "2026-07-24T11:00:30Z" }),
        makeRun(10, { createdAt: "2026-07-24T11:00:05Z" }),
      ],
    });

    const summary = await resolveTriggeredSchedules(NOW);

    expect(summary).toMatchObject({ checked: 1, linked: 1, resolved: 0 });
    const row = fakeStore.schedule.rowsSnapshot()[0];
    expect(row.runId).toBe(10n);
    expect(row.runUrl).toBe("https://github.com/o/r/actions/runs/10");
    expect(row.runConclusion).toBeNull();
    expect(listRunsMock).toHaveBeenCalledWith(
      "ghp_token", // decrypted
      "octo-org",
      "octo-repo",
      ".github/workflows/ci.yml",
      "main",
      new Date(RECENT.getTime() - 2 * 60 * 1000).toISOString()
    );
  });

  it("stores the conclusion immediately when the located run already completed", async () => {
    fakeStore.schedule = createFakeScheduleStore([
      makeScheduleRow({ id: "s1", status: "triggered", triggeredAt: RECENT }),
    ]);
    listRunsMock.mockResolvedValue({
      success: true,
      runs: [makeRun(10, { status: "completed", conclusion: "success" })],
    });

    const summary = await resolveTriggeredSchedules(NOW);

    expect(summary).toMatchObject({ linked: 1, resolved: 1 });
    expect(fakeStore.schedule.rowsSnapshot()[0].runConclusion).toBe("success");
  });

  it("never links two sibling schedules to the same run in one tick", async () => {
    fakeStore.schedule = createFakeScheduleStore([
      makeScheduleRow({ id: "first", status: "triggered", triggeredAt: RECENT }),
      makeScheduleRow({
        id: "second",
        status: "triggered",
        triggeredAt: new Date("2026-07-24T11:00:10Z"),
      }),
    ]);
    listRunsMock.mockResolvedValue({
      success: true,
      runs: [
        makeRun(10, { createdAt: "2026-07-24T11:00:05Z" }),
        makeRun(20, { createdAt: "2026-07-24T11:00:15Z" }),
      ],
    });

    await resolveTriggeredSchedules(NOW);

    const rows = new Map(fakeStore.schedule.rowsSnapshot().map((r) => [r.id, r]));
    expect(rows.get("first")!.runId).toBe(10n);
    expect(rows.get("second")!.runId).toBe(20n);
  });

  it("skips runs already linked in the database", async () => {
    fakeStore.schedule = createFakeScheduleStore([
      makeScheduleRow({
        id: "already-linked",
        status: "triggered",
        triggeredAt: RECENT,
        runId: 10n,
        runConclusion: "success",
      }),
      makeScheduleRow({ id: "s2", status: "triggered", triggeredAt: RECENT }),
    ]);
    listRunsMock.mockResolvedValue({
      success: true,
      runs: [makeRun(10), makeRun(20, { createdAt: "2026-07-24T11:00:15Z" })],
    });

    await resolveTriggeredSchedules(NOW);

    const rows = new Map(fakeStore.schedule.rowsSnapshot().map((r) => [r.id, r]));
    expect(rows.get("s2")!.runId).toBe(20n);
  });

  it("polls a linked schedule and records the conclusion once completed", async () => {
    fakeStore.schedule = createFakeScheduleStore([
      makeScheduleRow({ id: "s1", status: "triggered", triggeredAt: RECENT, runId: 10n }),
    ]);
    getRunMock.mockResolvedValue({
      success: true,
      run: makeRun(10, { status: "completed", conclusion: "failure" }),
    });

    const summary = await resolveTriggeredSchedules(NOW);

    expect(summary).toMatchObject({ resolved: 1 });
    expect(getRunMock).toHaveBeenCalledWith("ghp_token", "octo-org", "octo-repo", 10);
    expect(fakeStore.schedule.rowsSnapshot()[0].runConclusion).toBe("failure");
  });

  it("leaves an in-progress linked run unresolved for the next tick", async () => {
    fakeStore.schedule = createFakeScheduleStore([
      makeScheduleRow({ id: "s1", status: "triggered", triggeredAt: RECENT, runId: 10n }),
    ]);
    getRunMock.mockResolvedValue({
      success: true,
      run: makeRun(10, { status: "in_progress" }),
    });

    const summary = await resolveTriggeredSchedules(NOW);

    expect(summary).toMatchObject({ resolved: 0, errors: 0 });
    expect(fakeStore.schedule.rowsSnapshot()[0].runConclusion).toBeNull();
  });

  it("marks schedules unresolved for over 24h as unknown", async () => {
    fakeStore.schedule = createFakeScheduleStore([
      makeScheduleRow({ id: "stale", status: "triggered", triggeredAt: STALE }),
    ]);

    const summary = await resolveTriggeredSchedules(NOW);

    expect(summary).toMatchObject({ checked: 0, timedOut: 1 });
    expect(fakeStore.schedule.rowsSnapshot()[0].runConclusion).toBe("unknown");
    expect(listRunsMock).not.toHaveBeenCalled();
  });

  it("an API failure on one schedule doesn't block the others", async () => {
    fakeStore.schedule = createFakeScheduleStore([
      makeScheduleRow({ id: "bad", status: "triggered", triggeredAt: RECENT }),
      makeScheduleRow({
        id: "good",
        status: "triggered",
        triggeredAt: new Date("2026-07-24T11:00:10Z"),
      }),
    ]);
    listRunsMock
      .mockRejectedValueOnce(new Error("rate limited"))
      .mockResolvedValueOnce({
        success: true,
        runs: [makeRun(20, { createdAt: "2026-07-24T11:00:15Z" })],
      });

    const summary = await resolveTriggeredSchedules(NOW);

    expect(summary).toMatchObject({ checked: 2, linked: 1, errors: 1 });
    const rows = new Map(fakeStore.schedule.rowsSnapshot().map((r) => [r.id, r]));
    expect(rows.get("bad")!.runId).toBeNull();
    expect(rows.get("good")!.runId).toBe(20n);
  });

  it("finding no run yet is not an error — GitHub can lag; retry next tick", async () => {
    fakeStore.schedule = createFakeScheduleStore([
      makeScheduleRow({ id: "s1", status: "triggered", triggeredAt: RECENT }),
    ]);
    listRunsMock.mockResolvedValue({ success: true, runs: [] });

    const summary = await resolveTriggeredSchedules(NOW);

    expect(summary).toMatchObject({ checked: 1, linked: 0, errors: 0 });
    expect(fakeStore.schedule.rowsSnapshot()[0].runId).toBeNull();
  });
});
