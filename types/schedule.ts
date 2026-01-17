export interface ScheduleFormData {
  repository: string | null;
  workflow: string | null;
  environment: string;
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
  environment: string | null;
  scheduledAt: string; // ISO 8601 UTC timestamp
  timezone: string;
}
