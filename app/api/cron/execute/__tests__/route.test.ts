import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createFakeScheduleStore,
  makeScheduleRow,
} from "@/lib/actions/__tests__/fake-schedule-store";
import type { FakeScheduleStore } from "@/lib/actions/__tests__/fake-schedule-store";

const { fakeStore, dispatchMock } = vi.hoisted(() => ({
  fakeStore: { schedule: null as unknown as FakeScheduleStore },
  dispatchMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ prisma: fakeStore }));
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/crypto", () => ({
  encrypt: (value: string) => `enc:${value}`,
  decrypt: (value: string) => value.replace(/^enc:/, ""),
}));
vi.mock("@/lib/actions/github", () => ({
  triggerWorkflowDispatchWithToken: dispatchMock,
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
});
