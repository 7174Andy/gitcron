import { decrypt } from "@/lib/crypto";
import {
  getLinkedRunIds,
  getUnresolvedSchedules,
  linkScheduleRun,
  setRunConclusion,
  timeoutUnresolvedSchedules,
} from "@/lib/actions/schedules";
import {
  getWorkflowRunWithToken,
  listWorkflowRunsWithToken,
} from "@/lib/actions/github";
import { CLOCK_SKEW_MS, pickRunForSchedule } from "@/lib/run-matching";

export const RESOLUTION_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface ResolutionSummary {
  checked: number;
  linked: number;
  resolved: number;
  timedOut: number;
  errors: number;
}

// The post-dispatch half of the cron tick: locate the GitHub run each
// triggered schedule created (the dispatch API returns no run id), then poll
// linked runs until they complete. Anything unresolved past the 24h window
// is marked "unknown" up front so we never poll a schedule forever.
export async function resolveTriggeredSchedules(now: Date): Promise<ResolutionSummary> {
  const cutoff = new Date(now.getTime() - RESOLUTION_WINDOW_MS);

  const timedOut = await timeoutUnresolvedSchedules(cutoff);
  const unresolved = await getUnresolvedSchedules(cutoff);

  const summary: ResolutionSummary = {
    checked: unresolved.length,
    linked: 0,
    resolved: 0,
    timedOut: timedOut.count,
    errors: 0,
  };

  // Run ids already claimed per workflow, shared across this tick so two
  // sibling schedules (same repo + workflow) can never link the same run.
  const linkedByWorkflow = new Map<string, Set<number>>();

  for (const schedule of unresolved) {
    try {
      const token = decrypt(schedule.accessToken);

      if (schedule.runId === null) {
        // Locate: find the run this dispatch created.
        const key = `${schedule.repoFullName}#${schedule.workflowPath}`;
        let linked = linkedByWorkflow.get(key);
        if (!linked) {
          linked = await getLinkedRunIds(schedule.repoFullName, schedule.workflowPath);
          linkedByWorkflow.set(key, linked);
        }

        const createdAfter = new Date(
          schedule.triggeredAt.getTime() - CLOCK_SKEW_MS
        ).toISOString();

        const result = await listWorkflowRunsWithToken(
          token,
          schedule.owner,
          schedule.repo,
          schedule.workflowPath,
          schedule.ref,
          createdAfter
        );

        if (!result.success || !result.runs) {
          summary.errors++;
          continue;
        }

        const run = pickRunForSchedule(result.runs, schedule.triggeredAt, linked);

        // No matching run yet: GitHub can lag a few seconds after a
        // dispatch. Not an error - the next tick retries.
        if (!run) continue;

        const conclusion = run.status === "completed" ? run.conclusion : null;
        await linkScheduleRun(schedule.id, run.id, run.htmlUrl, conclusion);
        linked.add(run.id);
        summary.linked++;
        if (conclusion !== null) summary.resolved++;
      } else {
        // Resolve: poll the linked run until it completes.
        const result = await getWorkflowRunWithToken(
          token,
          schedule.owner,
          schedule.repo,
          Number(schedule.runId)
        );

        if (!result.success || !result.run) {
          summary.errors++;
          continue;
        }

        if (result.run.status === "completed") {
          await setRunConclusion(schedule.id, result.run.conclusion ?? "unknown");
          summary.resolved++;
        }
      }
    } catch (error) {
      console.error(`Failed to resolve schedule ${schedule.id}:`, error);
      summary.errors++;
    }
  }

  return summary;
}
