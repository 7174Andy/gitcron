// pending: editable, not yet due
// processing: claimed by the cron dispatcher, dispatch in flight (terminal-adjacent, non-editable)
// triggered / failed: terminal, non-editable
export type ScheduleStatus = "pending" | "processing" | "triggered" | "failed";

// Which dashboard section a schedule belongs to. "triggered" splits across
// two: the GitHub run is still live until a conclusion comes back.
export function scheduleBucket(
  status: ScheduleStatus,
  runConclusion: string | null,
): "scheduled" | "running" | "history" {
  if (status === "pending") return "scheduled";
  if (status === "processing" || (status === "triggered" && runConclusion === null)) {
    return "running";
  }
  return "history";
}

export interface ScheduleFormData {
  repository: string | null;
  workflow: string | null;
  inputs: Record<string, string>;
  date: string;
  time: string;
  timezone: string;
}

export interface SchedulePayload {
  repository: {
    owner: string;
    name: string;
    fullName: string;
  };
  workflow: {
    name: string;
    path: string;
  };
  inputs: Record<string, string>;
  scheduledAt: string; // ISO 8601 UTC timestamp
  timezone: string;
}
