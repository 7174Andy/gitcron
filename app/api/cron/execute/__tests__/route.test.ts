import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createFakeScheduleStore,
  makeScheduleRow,
} from "@/lib/actions/__tests__/fake-schedule-store";
import type { FakeScheduleStore } from "@/lib/actions/__tests__/fake-schedule-store";

const { fakeStore, dispatchMock, listRunsMock, getRunMock } = vi.hoisted(() => ({
  fakeStore: { schedule: null as unknown as FakeScheduleStore },
  dispatchMock: vi.fn(),
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
  triggerWorkflowDispatchWithToken: dispatchMock,
  listWorkflowRunsWithToken: listRunsMock,
  getWorkflowRunWithToken: getRunMock,
}));

import { GET } from "@/app/api/cron/execute/route";

const CRON_SECRET = "test-cron-secret";
const DUE_AT = new Date("2020-01-01T00:00:00Z");

function makeRequest(secret: string | null = CRON_SECRET) {
  return new Request("https://example.com/api/cron/execute", {
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
  });
}

beforeEach(() => {
  process.env.CRON_SECRET = CRON_SECRET;
  fakeStore.schedule = createFakeScheduleStore();
  dispatchMock.mockReset();
  dispatchMock.mockResolvedValue({ success: true });
  listRunsMock.mockReset();
  getRunMock.mockReset();
  listRunsMock.mockResolvedValue({ success: true, runs: [] });
  getRunMock.mockResolvedValue({ success: true, run: null });
});

describe("GET /api/cron/execute", () => {
  it("rejects requests without the correct cron secret", async () => {
    const response = await GET(makeRequest("wrong-secret"));
    expect(response.status).toBe(401);
    expect(dispatchMock).not.toHaveBeenCalled();
  });

  it("dispatches a single due schedule and marks it triggered (terminal state)", async () => {
    fakeStore.schedule = createFakeScheduleStore([
      makeScheduleRow({ id: "s1", status: "pending", scheduledAt: DUE_AT }),
    ]);

    const response = await GET(makeRequest());
    const body = await response.json();

    expect(body.processed).toBe(1);
    expect(body.triggered).toBe(1);
    expect(dispatchMock).toHaveBeenCalledTimes(1);
    expect(fakeStore.schedule.rowsSnapshot()[0].status).toBe("triggered");
  });

  it("marks a schedule failed (terminal state) when dispatch fails", async () => {
    dispatchMock.mockResolvedValue({ success: false, error: "GitHub API error: 422" });
    fakeStore.schedule = createFakeScheduleStore([
      makeScheduleRow({ id: "s1", status: "pending", scheduledAt: DUE_AT }),
    ]);

    const response = await GET(makeRequest());
    const body = await response.json();

    expect(body.failed).toBe(1);
    const row = fakeStore.schedule.rowsSnapshot()[0];
    expect(row.status).toBe("failed");
    expect(row.errorMessage).toBe("GitHub API error: 422");
  });

  it("does not process a pending schedule that isn't due yet", async () => {
    fakeStore.schedule = createFakeScheduleStore([
      makeScheduleRow({
        id: "s1",
        status: "pending",
        scheduledAt: new Date("2099-01-01T00:00:00Z"),
      }),
    ]);

    const response = await GET(makeRequest());
    const body = await response.json();

    expect(body.processed).toBe(0);
    expect(dispatchMock).not.toHaveBeenCalled();
  });

  it("dispatches exactly once when two overlapping cron invocations race over the same due schedule", async () => {
    fakeStore.schedule = createFakeScheduleStore([
      makeScheduleRow({ id: "s1", status: "pending", scheduledAt: DUE_AT }),
    ]);

    const [first, second] = await Promise.all([GET(makeRequest()), GET(makeRequest())]);
    const [firstBody, secondBody] = await Promise.all([first.json(), second.json()]);

    // Exactly one GitHub dispatch, no matter how the two invocations interleaved.
    expect(dispatchMock).toHaveBeenCalledTimes(1);

    const outcomes = [firstBody, secondBody].map((body) => ({
      triggered: body.triggered,
      skipped: body.skipped,
    }));
    expect(outcomes).toContainEqual({ triggered: 1, skipped: 0 });
    expect(outcomes).toContainEqual({ triggered: 0, skipped: 1 });

    // And the row itself lands in a single terminal state, never double-triggered.
    expect(fakeStore.schedule.rowsSnapshot()[0].status).toBe("triggered");
  });

  describe("run resolution pass", () => {
    it("dispatches due schedules and resolves triggered ones in the same invocation", async () => {
      const recentTrigger = new Date(Date.now() - 60_000);
      fakeStore.schedule = createFakeScheduleStore([
        makeScheduleRow({ id: "due", status: "pending", scheduledAt: DUE_AT }),
        makeScheduleRow({
          id: "awaiting-run",
          status: "triggered",
          triggeredAt: recentTrigger,
          workflowPath: ".github/workflows/deploy.yml",
          workflowName: "Deploy",
        }),
      ]);
      // Only the deploy workflow has a matching run; the just-dispatched ci
      // schedule finds nothing this tick (GitHub lag) and stays unresolved.
      listRunsMock.mockImplementation(async (_t, _o, _r, workflowPath: string) =>
        workflowPath === ".github/workflows/deploy.yml"
          ? {
              success: true,
              runs: [
                {
                  id: 77,
                  htmlUrl: "https://github.com/o/r/actions/runs/77",
                  status: "completed",
                  conclusion: "success",
                  createdAt: new Date(recentTrigger.getTime() + 5_000).toISOString(),
                },
              ],
            }
          : { success: true, runs: [] }
      );

      const response = await GET(makeRequest());
      const body = await response.json();

      expect(body.triggered).toBe(1);
      expect(body.resolution).toMatchObject({ linked: 1, resolved: 1 });
      const rows = new Map(fakeStore.schedule.rowsSnapshot().map((r) => [r.id, r]));
      expect(rows.get("awaiting-run")!.runUrl).toBe("https://github.com/o/r/actions/runs/77");
      expect(rows.get("awaiting-run")!.runConclusion).toBe("success");
      expect(rows.get("due")!.status).toBe("triggered");
    });

    it("a resolution error doesn't mask dispatch results", async () => {
      fakeStore.schedule = createFakeScheduleStore([
        makeScheduleRow({ id: "due", status: "pending", scheduledAt: DUE_AT }),
        makeScheduleRow({
          id: "awaiting-run",
          status: "triggered",
          triggeredAt: new Date(Date.now() - 60_000),
        }),
      ]);
      listRunsMock.mockRejectedValue(new Error("rate limited"));

      const response = await GET(makeRequest());
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.triggered).toBe(1);
      // Both the seeded schedule and the one dispatched this tick enter the
      // locate step and hit the rejecting mock, so errors is exactly 2.
      expect(body.resolution).toMatchObject({ errors: 2 });
    });
  });
});
