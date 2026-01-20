"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { encrypt } from "@/lib/crypto";
import type { SchedulePayload } from "@/types/schedule";

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
  status: string;
  triggeredAt: string | null;
  errorMessage: string | null;
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
    status: schedule.status,
    triggeredAt: schedule.triggeredAt?.toISOString() ?? null,
    errorMessage: schedule.errorMessage,
    createdAt: schedule.createdAt.toISOString(),
  };
}

export async function createSchedule(
  input: CreateScheduleInput
): Promise<{ success: true; schedule: ScheduleResponse } | { success: false; error: string }> {
  try {
    const session = await auth();

    if (!session?.accessToken || !session?.user?.id) {
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
        accessToken: encrypt(session.accessToken),
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

// Internal function for cron job - does not require session
export async function getDueSchedules() {
  const now = new Date();

  return prisma.schedule.findMany({
    where: {
      status: "pending",
      scheduledAt: {
        lte: now,
      },
    },
  });
}

export async function updateScheduleStatus(
  id: string,
  status: "triggered" | "failed",
  errorMessage?: string
) {
  return prisma.schedule.update({
    where: { id },
    data: {
      status,
      triggeredAt: status === "triggered" ? new Date() : undefined,
      errorMessage: errorMessage ?? null,
    },
  });
}
