"use client";

import { format } from "date-fns";

interface DateTimePickerProps {
  date: string;
  time: string;
  onDateChange: (date: string) => void;
  onTimeChange: (time: string) => void;
}

export function DateTimePicker({
  date,
  time,
  onDateChange,
  onTimeChange,
}: DateTimePickerProps) {
  // Get today's date as minimum
  const today = new Date();
  const minDate = format(today, "yyyy-MM-dd");

  return (
    <div className="flex gap-3">
      <div className="flex-1">
        <label className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Date
        </label>
        <input
          type="date"
          value={date}
          min={minDate}
          onChange={(e) => onDateChange(e.target.value)}
          className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none transition-colors focus:border-zinc-400 focus:ring-1 focus:ring-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:text-white dark:focus:border-zinc-600 dark:focus:ring-zinc-600"
        />
      </div>
      <div className="w-32">
        <label className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Time
        </label>
        <input
          type="time"
          value={time}
          onChange={(e) => onTimeChange(e.target.value)}
          className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none transition-colors focus:border-zinc-400 focus:ring-1 focus:ring-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:text-white dark:focus:border-zinc-600 dark:focus:ring-zinc-600"
        />
      </div>
    </div>
  );
}
