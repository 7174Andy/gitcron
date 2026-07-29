// Pure correlation logic for matching a dispatched schedule to the GitHub
// Actions run it created. The dispatch API returns 204 with no run id, so
// the cron resolution pass lists candidate runs and this picks the best one:
// the oldest run created at/after the dispatch time (minus a clock-skew
// buffer) that no sibling schedule has already claimed.

export const CLOCK_SKEW_MS = 2 * 60 * 1000;

export interface CandidateRun {
  id: number;
  htmlUrl: string;
  status: string;
  conclusion: string | null;
  createdAt: string; // ISO timestamp
}

export function pickRunForSchedule(
  runs: CandidateRun[],
  triggeredAt: Date,
  linkedRunIds: Set<number>,
): CandidateRun | null {
  const windowStart = triggeredAt.getTime() - CLOCK_SKEW_MS;

  const candidates = runs
    .filter(
      (run) =>
        !linkedRunIds.has(run.id) &&
        new Date(run.createdAt).getTime() >= windowStart,
    )
    .sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );

  return candidates[0] ?? null;
}
