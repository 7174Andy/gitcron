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
