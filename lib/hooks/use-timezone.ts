import { useState } from "react";
import { findTimezone, TIMEZONES } from "@/lib/timezone/data";

function detectTimezone(): string {
  if (typeof window === "undefined") {
    return "America/Los_Angeles";
  }

  try {
    const detectedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    // Check if the detected timezone is in our list
    if (findTimezone(detectedTimezone)) {
      return detectedTimezone;
    }

    // Try to find a matching timezone by offset
    const offset = new Date().getTimezoneOffset();
    const matchingTimezone = TIMEZONES.find((tz) => {
      const tzOffset = getTimezoneOffset(tz.value);
      return tzOffset === offset;
    });

    if (matchingTimezone) {
      return matchingTimezone.value;
    }
  } catch {
    // Ignore detection errors
  }

  return "America/Los_Angeles";
}

function getTimezoneOffset(timezone: string): number {
  const now = new Date();
  const utc = new Date(now.toLocaleString("en-US", { timeZone: "UTC" }));
  const tz = new Date(now.toLocaleString("en-US", { timeZone: timezone }));
  return (utc.getTime() - tz.getTime()) / 60000;
}

export function useTimezone(): string {
  const [timezone] = useState<string>(detectTimezone);
  return timezone;
}
