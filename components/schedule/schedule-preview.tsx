"use client";

import { useMemo } from "react";
import { localToUTC, formatUTCPreview, checkDSTWarning } from "@/lib/timezone/utils";

interface SchedulePreviewProps {
  date: string;
  time: string;
  timezone: string;
}

export function SchedulePreview({ date, time, timezone }: SchedulePreviewProps) {
  const preview = useMemo(() => {
    if (!date || !time) {
      return null;
    }

    try {
      const utcString = localToUTC(date, time, timezone);
      return formatUTCPreview(utcString);
    } catch {
      return null;
    }
  }, [date, time, timezone]);

  const dstWarning = useMemo(() => {
    return checkDSTWarning(date, time, timezone);
  }, [date, time, timezone]);

  if (!date || !time) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2">
      {dstWarning.type && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950">
          <WarningIcon className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <span className="text-sm text-amber-700 dark:text-amber-300">
            {dstWarning.message}
          </span>
        </div>
      )}

      {preview && (
        <div className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
          <ClockIcon className="h-4 w-4" />
          <span>UTC: {preview}</span>
        </div>
      )}
    </div>
  );
}

function WarningIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
      />
    </svg>
  );
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}
