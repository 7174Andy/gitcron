"use server";

import { auth } from "@/auth";
import { getGitHubAccessToken } from "@/lib/auth/access-token";
import { prisma } from "@/lib/db";
import { encrypt } from "@/lib/crypto";
import type { SchedulePayload, ScheduleStatus } from "@/types/schedule";

export interface CreateScheduleInput {
  payload: SchedulePayload;
}

export interface ScheduleResponse {
  id: string;
  owner: string;
  repo: string;
  repoFullName: string;
  workflowName: string;
  workflowPath: string;
  inputs: Record<string, string>;
  ref: string;
  scheduledAt: string;
  timezone: string;
  status: ScheduleStatus;
  triggeredAt: string | null;
  errorMessage: string | null;
  runUrl: string | null;
  runConclusion: string | null;
  createdAt: string;
}

function toScheduleResponse(schedule: {
  id: string;
  owner: string;
  repo: string;
  repoFullName: string;
  workflowName: string;
  workflowPath: string;
  inputs: unknown;
  ref: string;
  scheduledAt: Date;
  timezone: string;
  status: string;
  triggeredAt: Date | null;
  errorMessage: string | null;
  runUrl: string | null;
  runConclusion: string | null;
  createdAt: Date;
}): ScheduleResponse {
  return {
    id: schedule.id,
    owner: schedule.owner,
    repo: schedule.repo,
    repoFullName: schedule.repoFullName,
    workflowName: schedule.workflowName,
    workflowPath: schedule.workflowPath,
    inputs: (schedule.inputs as Record<string, string>) || {},
    ref: schedule.ref,
    scheduledAt: schedule.scheduledAt.toISOString(),
    timezone: schedule.timezone,
    status: schedule.status as ScheduleStatus,
    triggeredAt: schedule.triggeredAt?.toISOString() ?? null,
    errorMessage: schedule.errorMessage,
    runUrl: schedule.runUrl,
    runConclusion: schedule.runConclusion,
    createdAt: schedule.createdAt.toISOString(),
  };
}

export async function createSchedule(
  input: CreateScheduleInput
): Promise<{ success: true; schedule: ScheduleResponse } | { success: false; error: string }> {
  try {
    const session = await auth();
    const accessToken = await getGitHubAccessToken();

    if (!accessToken || !session?.user?.id) {
      return { success: false, error: "Not authenticated" };
    }

    const { payload } = input;

    const schedule = await prisma.schedule.create({
      data: {
        userId: session.user.id,
        owner: payload.repository.owner,
        repo: payload.repository.name,
        repoFullName: payload.repository.fullName,
        workflowName: payload.workflow.name,
        workflowPath: payload.workflow.path,
        inputs: payload.inputs,
        scheduledAt: new Date(payload.scheduledAt),
        timezone: payload.timezone,
        accessToken: encrypt(accessToken),
      },
      select: {
        id: true,
        owner: true,
        repo: true,
        repoFullName: true,
        workflowName: true,
        workflowPath: true,
        inputs: true,
        ref: true,
        scheduledAt: true,
        timezone: true,
        status: true,
        triggeredAt: true,
        errorMessage: true,
        runUrl: true,
        runConclusion: true,
        createdAt: true,
      },
    });

    return { success: true, schedule: toScheduleResponse(schedule) };
  } catch (error) {
    console.error("Failed to create schedule:", error);
    return { success: false, error: "Failed to create schedule" };
  }
}

export async function getSchedules(): Promise<
  { success: true; schedules: ScheduleResponse[] } | { success: false; error: string }
> {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return { success: false, error: "Not authenticated" };
    }

    const schedules = await prisma.schedule.findMany({
      where: {
        userId: session.user.id,
      },
      select: {
        id: true,
        owner: true,
        repo: true,
        repoFullName: true,
        workflowName: true,
        workflowPath: true,
        inputs: true,
        ref: true,
        scheduledAt: true,
        timezone: true,
        status: true,
        triggeredAt: true,
        errorMessage: true,
        runUrl: true,
        runConclusion: true,
        createdAt: true,
      },
      orderBy: {
        scheduledAt: "asc",
      },
    });

    return { success: true, schedules: schedules.map(toScheduleResponse) };
  } catch (error) {
    console.error("Failed to fetch schedules:", error);
    return { success: false, error: "Failed to fetch schedules" };
  }
}

export async function deleteSchedule(
  id: string
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return { success: false, error: "Not authenticated" };
    }

    // Verify ownership before deleting
    const schedule = await prisma.schedule.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
    });

    if (!schedule) {
      return { success: false, error: "Schedule not found" };
    }

    // Only allow deleting pending schedules
    if (schedule.status !== "pending") {
      return { success: false, error: "Cannot delete a schedule that has already been executed" };
    }

    await prisma.schedule.delete({
      where: { id },
    });

    return { success: true };
  } catch (error) {
    console.error("Failed to delete schedule:", error);
    return { success: false, error: "Failed to delete schedule" };
  }
}

export async function updateSchedule(
  id: string,
  input: CreateScheduleInput
): Promise<{ success: true; schedule: ScheduleResponse } | { success: false; error: string }> {
  try {
    const session = await auth();
    const accessToken = await getGitHubAccessToken();

    if (!accessToken || !session?.user?.id) {
      return { success: false, error: "Not authenticated" };
    }

    const { payload } = input;

    // Atomically guard against a race with the cron poller (/api/cron/execute),
    // which may flip this schedule to triggered/failed between the user opening
    // the edit form and submitting.
    const result = await prisma.schedule.updateMany({
      where: {
        id,
        userId: session.user.id,
        status: "pending",
      },
      data: {
        owner: payload.repository.owner,
        repo: payload.repository.name,
        repoFullName: payload.repository.fullName,
        workflowName: payload.workflow.name,
        workflowPath: payload.workflow.path,
        inputs: payload.inputs,
        scheduledAt: new Date(payload.scheduledAt),
        timezone: payload.timezone,
        accessToken: encrypt(accessToken),
      },
    });

    if (result.count === 0) {
      return {
        success: false,
        error: "This schedule is no longer pending and can no longer be edited.",
      };
    }

    const schedule = await prisma.schedule.findUniqueOrThrow({
      where: { id },
      select: {
        id: true,
        owner: true,
        repo: true,
        repoFullName: true,
        workflowName: true,
        workflowPath: true,
        inputs: true,
        ref: true,
        scheduledAt: true,
        timezone: true,
        status: true,
        triggeredAt: true,
        errorMessage: true,
        runUrl: true,
        runConclusion: true,
        createdAt: true,
      },
    });

    return { success: true, schedule: toScheduleResponse(schedule) };
  } catch (error) {
    console.error("Failed to update schedule:", error);
    return { success: false, error: "Failed to update schedule" };
  }
}

export interface ClaimedSchedule {
  id: string;
  owner: string;
  repo: string;
  repoFullName: string;
  workflowName: string;
  workflowPath: string;
  inputs: unknown;
  ref: string;
  accessToken: string;
}

// Internal functions for the cron job - do not require a session.
//
// The cron dispatcher must never dispatch a workflow using field values it
// read before it acquired exclusive ownership of the row: a user's edit
// (guarded on status "pending" in updateSchedule above) can land at any time
// up until this dispatcher claims the row. So this is split into two steps:
//
//   1. getDueScheduleIds: a cheap read of candidate ids. This snapshot can go
//      stale (a schedule may be edited, rescheduled, or claimed by another
//      concurrent invocation) and that's fine - it's never used for dispatch,
//      only to know what to attempt to claim.
//   2. claimSchedule: an atomic pending -> processing transition, conditioned
//      on the row still being pending and still due. Only the caller that
//      wins this conditional update (count === 1) owns the row, which is
//      what prevents two overlapping cron invocations from both dispatching
//      the same schedule. The winner then re-reads the row from the database
//      so dispatch always uses the latest edited values, not the stale
//      snapshot from step 1.

export async function getDueScheduleIds(now: Date): Promise<string[]> {
  const due = await prisma.schedule.findMany({
    where: {
      status: "pending",
      scheduledAt: {
        lte: now,
      },
    },
    select: { id: true },
  });

  return due.map((schedule) => schedule.id);
}

export async function claimSchedule(
  id: string,
  now: Date
): Promise<ClaimedSchedule | null> {
  const claim = await prisma.schedule.updateMany({
    where: {
      id,
      status: "pending",
      scheduledAt: {
        lte: now,
      },
    },
    data: {
      status: "processing",
    },
  });

  // Someone else already claimed this row, it was edited to a future date,
  // or it was deleted - either way, this invocation does not own it.
  if (claim.count === 0) {
    return null;
  }

  return prisma.schedule.findUniqueOrThrow({
    where: { id },
    select: {
      id: true,
      owner: true,
      repo: true,
      repoFullName: true,
      workflowName: true,
      workflowPath: true,
      inputs: true,
      ref: true,
      accessToken: true,
    },
  });
}

// Moves a claimed (processing) schedule to a terminal state. Guarded on the
// row still being "processing" so a stray double-call can't clobber a
// terminal state that's already been set.
export async function updateScheduleStatus(
  id: string,
  status: "triggered" | "failed",
  errorMessage?: string
) {
  return prisma.schedule.updateMany({
    where: { id, status: "processing" },
    data: {
      status,
      triggeredAt: status === "triggered" ? new Date() : undefined,
      errorMessage: errorMessage ?? null,
    },
  });
}

// --- Run resolution helpers (cron-internal, no session) ---
//
// After a dispatch succeeds, GitHub gives us no run id (the dispatch API
// returns 204). These helpers back the resolution pass in
// lib/cron/resolve-runs.ts, which locates the created run via time-window
// matching and polls it to completion. A schedule is "unresolved" while
// status is "triggered" and runConclusion is null; `cutoff` is now − 24h,
// past which the pass gives up and marks the row "unknown".

export interface UnresolvedSchedule {
  id: string;
  owner: string;
  repo: string;
  repoFullName: string;
  workflowPath: string;
  ref: string;
  triggeredAt: Date;
  runId: bigint | null;
  accessToken: string;
}

export async function getUnresolvedSchedules(cutoff: Date): Promise<UnresolvedSchedule[]> {
  const rows = await prisma.schedule.findMany({
    where: {
      status: "triggered",
      runConclusion: null,
      triggeredAt: { gte: cutoff },
    },
    select: {
      id: true,
      owner: true,
      repo: true,
      repoFullName: true,
      workflowPath: true,
      ref: true,
      triggeredAt: true,
      runId: true,
      accessToken: true,
    },
  });

  // Sorted in JS (not orderBy) so schedules link runs in dispatch order,
  // which is what makes sibling-run assignment deterministic.
  return (rows as UnresolvedSchedule[]).sort(
    (a, b) => a.triggeredAt.getTime() - b.triggeredAt.getTime()
  );
}

export async function getLinkedRunIds(
  repoFullName: string,
  workflowPath: string
): Promise<Set<number>> {
  const rows = await prisma.schedule.findMany({
    where: { repoFullName, workflowPath },
    select: { runId: true },
  });

  return new Set(
    rows
      .filter((row) => row.runId !== null)
      .map((row) => Number(row.runId))
  );
}

// Guarded on runId still being null so a re-run of the pass (or an
// overlapping cron invocation) can't relink an already-linked schedule.
export async function linkScheduleRun(
  id: string,
  runId: number,
  runUrl: string,
  conclusion: string | null
) {
  return prisma.schedule.updateMany({
    where: { id, status: "triggered", runId: null },
    data: {
      runId: BigInt(runId),
      runUrl,
      runConclusion: conclusion,
    },
  });
}

// Guarded on runConclusion still being null so a conclusion, once recorded,
// is never clobbered.
export async function setRunConclusion(id: string, conclusion: string) {
  return prisma.schedule.updateMany({
    where: { id, status: "triggered", runConclusion: null },
    data: { runConclusion: conclusion },
  });
}

export async function timeoutUnresolvedSchedules(cutoff: Date) {
  return prisma.schedule.updateMany({
    where: {
      status: "triggered",
      runConclusion: null,
      triggeredAt: { lt: cutoff },
    },
    data: { runConclusion: "unknown" },
  });
}
