import { format, parse } from "date-fns";
import { toZonedTime, fromZonedTime } from "date-fns-tz";

export interface DSTWarning {
  type: "spring-forward" | "fall-back" | null;
  message: string | null;
}

export function localToUTC(
  date: string,
  time: string,
  timezone: string
): string {
  // Parse the local date and time
  const localDateTimeString = `${date}T${time}:00`;
  const localDate = parse(localDateTimeString, "yyyy-MM-dd'T'HH:mm:ss", new Date());

  // Convert from the specified timezone to UTC
  const utcDate = fromZonedTime(localDate, timezone);

  return utcDate.toISOString();
}

export function utcToLocal(
  utcDateString: string,
  timezone: string
): { date: string; time: string } {
  const utcDate = new Date(utcDateString);
  const zonedDate = toZonedTime(utcDate, timezone);

  return {
    date: format(zonedDate, "yyyy-MM-dd"),
    time: format(zonedDate, "HH:mm"),
  };
}

export function formatUTCPreview(utcDateString: string): string {
  const date = new Date(utcDateString);
  return format(date, "yyyy-MM-dd'T'HH:mm:ss'Z'");
}

export function checkDSTWarning(
  date: string,
  time: string,
  timezone: string
): DSTWarning {
  if (!date || !time) {
    return { type: null, message: null };
  }

  try {
    const localDateTimeString = `${date}T${time}:00`;
    const localDate = parse(localDateTimeString, "yyyy-MM-dd'T'HH:mm:ss", new Date());

    // Convert to UTC and back to detect DST transitions
    const utcDate = fromZonedTime(localDate, timezone);
    const backToLocal = toZonedTime(utcDate, timezone);

    const originalHour = localDate.getHours();
    const convertedHour = backToLocal.getHours();

    if (originalHour !== convertedHour) {
      // Check if this is spring forward (hour skipped) or fall back (hour ambiguous)
      const hourDiff = convertedHour - originalHour;

      if (hourDiff > 0 || hourDiff === -23) {
        // Spring forward - the specified time doesn't exist
        return {
          type: "spring-forward",
          message: `This time doesn't exist due to DST. The clock skips from ${formatHour(originalHour - 1)}:59 to ${formatHour(convertedHour)}:00.`,
        };
      } else {
        // Fall back - the specified time is ambiguous
        return {
          type: "fall-back",
          message: `This time occurs twice due to DST. The first occurrence will be used.`,
        };
      }
    }

    return { type: null, message: null };
  } catch {
    return { type: null, message: null };
  }
}

function formatHour(hour: number): string {
  const normalizedHour = ((hour % 24) + 24) % 24;
  const period = normalizedHour >= 12 ? "PM" : "AM";
  const displayHour = normalizedHour % 12 || 12;
  return `${displayHour}:00 ${period}`;
}

export function getCurrentOffset(timezone: string): string {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      timeZoneName: "shortOffset",
    });

    const parts = formatter.formatToParts(now);
    const offsetPart = parts.find((p) => p.type === "timeZoneName");
    return offsetPart?.value || "";
  } catch {
    return "";
  }
}
