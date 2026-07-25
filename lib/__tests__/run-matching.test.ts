import { describe, expect, it } from "vitest";
import { pickRunForSchedule, type CandidateRun } from "@/lib/run-matching";

const TRIGGERED_AT = new Date("2026-07-24T12:00:00Z");

function makeRun(overrides: Partial<CandidateRun> = {}): CandidateRun {
  return {
    id: 1,
    htmlUrl: "https://github.com/o/r/actions/runs/1",
    status: "in_progress",
    conclusion: null,
    createdAt: "2026-07-24T12:00:05Z",
    ...overrides,
  };
}

describe("pickRunForSchedule", () => {
  it("picks the oldest run created at/after the dispatch time", () => {
    const runs = [
      makeRun({ id: 3, createdAt: "2026-07-24T12:00:30Z" }),
      makeRun({ id: 2, createdAt: "2026-07-24T12:00:05Z" }),
    ];

    const picked = pickRunForSchedule(runs, TRIGGERED_AT, new Set());

    expect(picked?.id).toBe(2);
  });

  it("tolerates clock skew up to 2 minutes before the dispatch time", () => {
    const runs = [makeRun({ id: 5, createdAt: "2026-07-24T11:58:30Z" })];

    const picked = pickRunForSchedule(runs, TRIGGERED_AT, new Set());

    expect(picked?.id).toBe(5);
  });

  it("rejects runs created before the skew window", () => {
    const runs = [makeRun({ id: 5, createdAt: "2026-07-24T11:57:00Z" })];

    const picked = pickRunForSchedule(runs, TRIGGERED_AT, new Set());

    expect(picked).toBeNull();
  });

  it("skips runs already linked to sibling schedules", () => {
    const runs = [
      makeRun({ id: 2, createdAt: "2026-07-24T12:00:05Z" }),
      makeRun({ id: 3, createdAt: "2026-07-24T12:00:30Z" }),
    ];

    const picked = pickRunForSchedule(runs, TRIGGERED_AT, new Set([2]));

    expect(picked?.id).toBe(3);
  });

  it("returns null when there are no candidates", () => {
    expect(pickRunForSchedule([], TRIGGERED_AT, new Set())).toBeNull();
  });
});
