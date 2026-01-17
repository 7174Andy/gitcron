export interface TimezoneInfo {
  value: string;
  label: string;
  offset: string;
  abbr: string;
}

// Common IANA timezones with labels
export const TIMEZONES: TimezoneInfo[] = [
  // Americas
  { value: "America/New_York", label: "New York", offset: "UTC-5", abbr: "ET" },
  { value: "America/Chicago", label: "Chicago", offset: "UTC-6", abbr: "CT" },
  { value: "America/Denver", label: "Denver", offset: "UTC-7", abbr: "MT" },
  { value: "America/Los_Angeles", label: "Los Angeles", offset: "UTC-8", abbr: "PT" },
  { value: "America/Phoenix", label: "Phoenix", offset: "UTC-7", abbr: "MST" },
  { value: "America/Anchorage", label: "Anchorage", offset: "UTC-9", abbr: "AKT" },
  { value: "Pacific/Honolulu", label: "Honolulu", offset: "UTC-10", abbr: "HST" },
  { value: "America/Toronto", label: "Toronto", offset: "UTC-5", abbr: "ET" },
  { value: "America/Vancouver", label: "Vancouver", offset: "UTC-8", abbr: "PT" },
  { value: "America/Mexico_City", label: "Mexico City", offset: "UTC-6", abbr: "CST" },
  { value: "America/Sao_Paulo", label: "Sao Paulo", offset: "UTC-3", abbr: "BRT" },
  { value: "America/Buenos_Aires", label: "Buenos Aires", offset: "UTC-3", abbr: "ART" },
  { value: "America/Lima", label: "Lima", offset: "UTC-5", abbr: "PET" },
  { value: "America/Bogota", label: "Bogota", offset: "UTC-5", abbr: "COT" },

  // Europe
  { value: "UTC", label: "UTC", offset: "UTC+0", abbr: "UTC" },
  { value: "Europe/London", label: "London", offset: "UTC+0", abbr: "GMT" },
  { value: "Europe/Paris", label: "Paris", offset: "UTC+1", abbr: "CET" },
  { value: "Europe/Berlin", label: "Berlin", offset: "UTC+1", abbr: "CET" },
  { value: "Europe/Madrid", label: "Madrid", offset: "UTC+1", abbr: "CET" },
  { value: "Europe/Rome", label: "Rome", offset: "UTC+1", abbr: "CET" },
  { value: "Europe/Amsterdam", label: "Amsterdam", offset: "UTC+1", abbr: "CET" },
  { value: "Europe/Zurich", label: "Zurich", offset: "UTC+1", abbr: "CET" },
  { value: "Europe/Stockholm", label: "Stockholm", offset: "UTC+1", abbr: "CET" },
  { value: "Europe/Warsaw", label: "Warsaw", offset: "UTC+1", abbr: "CET" },
  { value: "Europe/Athens", label: "Athens", offset: "UTC+2", abbr: "EET" },
  { value: "Europe/Moscow", label: "Moscow", offset: "UTC+3", abbr: "MSK" },
  { value: "Europe/Istanbul", label: "Istanbul", offset: "UTC+3", abbr: "TRT" },

  // Asia
  { value: "Asia/Dubai", label: "Dubai", offset: "UTC+4", abbr: "GST" },
  { value: "Asia/Karachi", label: "Karachi", offset: "UTC+5", abbr: "PKT" },
  { value: "Asia/Kolkata", label: "Mumbai / Delhi", offset: "UTC+5:30", abbr: "IST" },
  { value: "Asia/Dhaka", label: "Dhaka", offset: "UTC+6", abbr: "BST" },
  { value: "Asia/Bangkok", label: "Bangkok", offset: "UTC+7", abbr: "ICT" },
  { value: "Asia/Jakarta", label: "Jakarta", offset: "UTC+7", abbr: "WIB" },
  { value: "Asia/Singapore", label: "Singapore", offset: "UTC+8", abbr: "SGT" },
  { value: "Asia/Hong_Kong", label: "Hong Kong", offset: "UTC+8", abbr: "HKT" },
  { value: "Asia/Shanghai", label: "Shanghai", offset: "UTC+8", abbr: "CST" },
  { value: "Asia/Taipei", label: "Taipei", offset: "UTC+8", abbr: "CST" },
  { value: "Asia/Seoul", label: "Seoul", offset: "UTC+9", abbr: "KST" },
  { value: "Asia/Tokyo", label: "Tokyo", offset: "UTC+9", abbr: "JST" },

  // Australia & Pacific
  { value: "Australia/Perth", label: "Perth", offset: "UTC+8", abbr: "AWST" },
  { value: "Australia/Adelaide", label: "Adelaide", offset: "UTC+9:30", abbr: "ACST" },
  { value: "Australia/Sydney", label: "Sydney", offset: "UTC+10", abbr: "AEST" },
  { value: "Australia/Melbourne", label: "Melbourne", offset: "UTC+10", abbr: "AEST" },
  { value: "Australia/Brisbane", label: "Brisbane", offset: "UTC+10", abbr: "AEST" },
  { value: "Pacific/Auckland", label: "Auckland", offset: "UTC+12", abbr: "NZST" },
  { value: "Pacific/Fiji", label: "Fiji", offset: "UTC+12", abbr: "FJT" },

  // Africa
  { value: "Africa/Cairo", label: "Cairo", offset: "UTC+2", abbr: "EET" },
  { value: "Africa/Lagos", label: "Lagos", offset: "UTC+1", abbr: "WAT" },
  { value: "Africa/Johannesburg", label: "Johannesburg", offset: "UTC+2", abbr: "SAST" },
  { value: "Africa/Nairobi", label: "Nairobi", offset: "UTC+3", abbr: "EAT" },
];

export function getTimezoneLabel(timezone: TimezoneInfo): string {
  return `${timezone.label} (${timezone.abbr}, ${timezone.offset})`;
}

export function findTimezone(value: string): TimezoneInfo | undefined {
  return TIMEZONES.find((tz) => tz.value === value);
}

export function filterTimezones(search: string): TimezoneInfo[] {
  const query = search.toLowerCase();
  return TIMEZONES.filter(
    (tz) =>
      tz.value.toLowerCase().includes(query) ||
      tz.label.toLowerCase().includes(query) ||
      tz.abbr.toLowerCase().includes(query)
  );
}
