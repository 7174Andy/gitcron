import { NextResponse } from "next/server";
import { getDueSchedules, updateScheduleStatus } from "@/lib/actions/schedules";
import { triggerWorkflowDispatchWithToken } from "@/lib/actions/github";
import { decrypt } from "@/lib/crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ExecutionResult {
  id: string;
  repoFullName: string;
  workflowName: string;
  status: "triggered" | "failed";
  error?: string;
}

export async function GET(request: Request) {
  // Verify cron secret for security
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error("CRON_SECRET not configured");
    return NextResponse.json(
      { error: "Server misconfiguration" },
      { status: 500 }
    );
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    // Get all pending schedules that are due
    const dueSchedules = await getDueSchedules();

    if (dueSchedules.length === 0) {
      return NextResponse.json({
        message: "No schedules due",
        processed: 0,
      });
    }

    const results: ExecutionResult[] = [];

    // Process each due schedule
    for (const schedule of dueSchedules) {
      try {
        // Get inputs from schedule (stored as JSON)
        const inputs = (schedule.inputs as Record<string, string>) || {};

        // Decrypt token and trigger the workflow
        const decryptedToken = decrypt(schedule.accessToken);
        const result = await triggerWorkflowDispatchWithToken(
          decryptedToken,
          schedule.owner,
          schedule.repo,
          schedule.workflowPath,
          schedule.ref,
          Object.keys(inputs).length > 0 ? inputs : undefined
        );

        if (result.success) {
          await updateScheduleStatus(schedule.id, "triggered");
          results.push({
            id: schedule.id,
            repoFullName: schedule.repoFullName,
            workflowName: schedule.workflowName,
            status: "triggered",
          });
        } else {
          await updateScheduleStatus(schedule.id, "failed", result.error);
          results.push({
            id: schedule.id,
            repoFullName: schedule.repoFullName,
            workflowName: schedule.workflowName,
            status: "failed",
            error: result.error,
          });
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        await updateScheduleStatus(schedule.id, "failed", errorMessage);
        results.push({
          id: schedule.id,
          repoFullName: schedule.repoFullName,
          workflowName: schedule.workflowName,
          status: "failed",
          error: errorMessage,
        });
      }
    }

    const triggered = results.filter((r) => r.status === "triggered").length;
    const failed = results.filter((r) => r.status === "failed").length;

    return NextResponse.json({
      message: `Processed ${results.length} schedules`,
      processed: results.length,
      triggered,
      failed,
      results,
    });
  } catch (error) {
    console.error("Cron execution failed:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
