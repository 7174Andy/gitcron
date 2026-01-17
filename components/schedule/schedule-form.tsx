"use client";

import { useState, useMemo } from "react";
import { format } from "date-fns";
import { RepositorySelect } from "./repository-select";
import { WorkflowSelect } from "./workflow-select";
import { DateTimePicker } from "./datetime-picker";
import { TimezoneSelect } from "./timezone-select";
import { SchedulePreview } from "./schedule-preview";
import { Input } from "@/components/ui/input";
import { useTimezone } from "@/lib/hooks/use-timezone";
import { localToUTC } from "@/lib/timezone/utils";
import type { GitHubRepository, WorkflowFile } from "@/lib/github/types";
import type { SchedulePayload } from "@/types/schedule";

function isTimeInPast(date: string, time: string, timezone: string): boolean {
  if (!date || !time) return false;
  try {
    const utcTime = localToUTC(date, time, timezone);
    return new Date(utcTime) <= new Date();
  } catch {
    return false;
  }
}

interface ScheduleFormProps {
  onClose?: () => void;
}

export function ScheduleForm({ onClose }: ScheduleFormProps) {
  const detectedTimezone = useTimezone();

  const [selectedRepo, setSelectedRepo] = useState<GitHubRepository | null>(null);
  const [selectedWorkflow, setSelectedWorkflow] = useState<WorkflowFile | null>(null);
  const [environment, setEnvironment] = useState("");

  // Initialize with tomorrow's date
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const [date, setDate] = useState(format(tomorrow, "yyyy-MM-dd"));
  const [time, setTime] = useState("09:00");
  const [timezone, setTimezone] = useState(detectedTimezone);

  const [isSubmitting, setIsSubmitting] = useState(false);

  const isPast = useMemo(
    () => isTimeInPast(date, time, timezone),
    [date, time, timezone]
  );

  function handleRepoChange(fullName: string, repo: GitHubRepository) {
    setSelectedRepo(repo);
    setSelectedWorkflow(null);
  }

  function handleWorkflowChange(path: string, workflow: WorkflowFile) {
    setSelectedWorkflow(workflow);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!selectedRepo || !selectedWorkflow || !date || !time) {
      return;
    }

    setIsSubmitting(true);

    try {
      const utcTime = localToUTC(date, time, timezone);

      const payload: SchedulePayload = {
        repository: {
          owner: selectedRepo.owner.login,
          name: selectedRepo.name,
          fullName: selectedRepo.full_name,
        },
        workflow: {
          name: selectedWorkflow.name,
          path: selectedWorkflow.path,
        },
        environment: environment.trim() || null,
        scheduledAt: utcTime,
        timezone,
      };

      console.log("Schedule payload:", payload);

      // TODO: Save to database
      alert("Schedule created! Check the console for details.");

      onClose?.();
    } catch (err) {
      console.error("Failed to create schedule:", err);
    } finally {
      setIsSubmitting(false);
    }
  }

  const isValid = selectedRepo && selectedWorkflow && date && time && !isPast;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Repository
          </label>
          <RepositorySelect
            value={selectedRepo?.full_name || null}
            onChange={handleRepoChange}
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Workflow
          </label>
          <WorkflowSelect
            owner={selectedRepo?.owner.login || null}
            repo={selectedRepo?.name || null}
            value={selectedWorkflow?.path || null}
            onChange={handleWorkflowChange}
          />
        </div>

        <Input
          label="Environment (optional)"
          value={environment}
          onChange={(e) => setEnvironment(e.target.value)}
          placeholder="e.g., staging-test-123"
        />
      </div>

      <div className="h-px bg-zinc-200 dark:bg-zinc-800" />

      <div className="flex flex-col gap-4">
        <DateTimePicker
          date={date}
          time={time}
          onDateChange={setDate}
          onTimeChange={setTime}
        />

        <TimezoneSelect value={timezone} onChange={setTimezone} />

        <SchedulePreview date={date} time={time} timezone={timezone} />

        {isPast && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950">
            <svg
              className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span className="text-sm text-red-700 dark:text-red-300">
              The selected time is in the past. Please choose a future time.
            </span>
          </div>
        )}
      </div>

      <div className="flex justify-end gap-3 pt-2">
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-lg border border-zinc-200 px-4 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={!isValid || isSubmitting}
          className="h-10 rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100"
        >
          {isSubmitting ? "Scheduling..." : "Schedule"}
        </button>
      </div>
    </form>
  );
}
