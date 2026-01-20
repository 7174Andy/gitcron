"use client";

import { useState, useMemo, useEffect } from "react";
import { format } from "date-fns";
import { RepositorySelect } from "./repository-select";
import { WorkflowSelect } from "./workflow-select";
import { DateTimePicker } from "./datetime-picker";
import { TimezoneSelect } from "./timezone-select";
import { SchedulePreview } from "./schedule-preview";
import { Input } from "@/components/ui/input";
import { useTimezone } from "@/lib/hooks/use-timezone";
import { localToUTC } from "@/lib/timezone/utils";
import { createSchedule } from "@/lib/actions/schedules";
import { fetchWorkflowInputs } from "@/lib/actions/github";
import type { GitHubRepository, WorkflowFile, WorkflowInput } from "@/lib/github/types";
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
  onScheduleCreated?: () => void;
}

export function ScheduleForm({ onClose, onScheduleCreated }: ScheduleFormProps) {
  const detectedTimezone = useTimezone();
  const [error, setError] = useState<string | null>(null);

  const [selectedRepo, setSelectedRepo] = useState<GitHubRepository | null>(null);
  const [selectedWorkflow, setSelectedWorkflow] = useState<WorkflowFile | null>(null);

  // Workflow inputs
  const [workflowInputs, setWorkflowInputs] = useState<WorkflowInput[]>([]);
  const [inputValues, setInputValues] = useState<Record<string, string>>({});
  const [isLoadingInputs, setIsLoadingInputs] = useState(false);

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

  // Fetch workflow inputs when workflow is selected
  useEffect(() => {
    if (!selectedRepo || !selectedWorkflow) {
      setWorkflowInputs([]);
      setInputValues({});
      return;
    }

    async function loadInputs() {
      setIsLoadingInputs(true);
      try {
        const inputs = await fetchWorkflowInputs(
          selectedRepo!.owner.login,
          selectedRepo!.name,
          selectedWorkflow!.path
        );
        setWorkflowInputs(inputs);

        // Initialize input values with defaults
        const defaults: Record<string, string> = {};
        inputs.forEach((input) => {
          if (input.default) {
            defaults[input.name] = input.default;
          }
        });
        setInputValues(defaults);
      } catch (err) {
        console.error("Failed to fetch workflow inputs:", err);
      } finally {
        setIsLoadingInputs(false);
      }
    }

    loadInputs();
  }, [selectedRepo, selectedWorkflow]);

  function handleRepoChange(fullName: string, repo: GitHubRepository) {
    setSelectedRepo(repo);
    setSelectedWorkflow(null);
    setWorkflowInputs([]);
    setInputValues({});
  }

  function handleWorkflowChange(path: string, workflow: WorkflowFile) {
    setSelectedWorkflow(workflow);
  }

  function handleInputChange(name: string, value: string) {
    setInputValues((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!selectedRepo || !selectedWorkflow || !date || !time) {
      return;
    }

    // Check required inputs
    const missingRequired = workflowInputs
      .filter((input) => input.required && !inputValues[input.name])
      .map((input) => input.name);

    if (missingRequired.length > 0) {
      setError(`Missing required inputs: ${missingRequired.join(", ")}`);
      return;
    }

    setIsSubmitting(true);

    try {
      const utcTime = localToUTC(date, time, timezone);

      // Filter out empty values
      const filteredInputs: Record<string, string> = {};
      Object.entries(inputValues).forEach(([key, value]) => {
        if (value.trim()) {
          filteredInputs[key] = value.trim();
        }
      });

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
        inputs: filteredInputs,
        scheduledAt: utcTime,
        timezone,
      };

      const result = await createSchedule({ payload });

      if (!result.success) {
        setError(result.error);
        return;
      }

      onScheduleCreated?.();
      onClose?.();
    } catch (err) {
      console.error("Failed to create schedule:", err);
      setError("An unexpected error occurred");
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

        {/* Dynamic Workflow Inputs */}
        {isLoadingInputs && (
          <div className="flex items-center gap-2 text-sm text-zinc-500">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-600" />
            Loading workflow inputs...
          </div>
        )}

        {workflowInputs.length > 0 && (
          <div className="flex flex-col gap-3 rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
            <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Workflow Inputs
            </h3>
            {workflowInputs.map((input) => (
              <div key={input.name}>
                {input.type === "choice" && input.options ? (
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-zinc-600 dark:text-zinc-400">
                      {input.name}
                      {input.required && <span className="ml-1 text-red-500">*</span>}
                    </label>
                    <select
                      value={inputValues[input.name] || ""}
                      onChange={(e) => handleInputChange(input.name, e.target.value)}
                      className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none transition-colors focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:focus:border-zinc-500"
                    >
                      <option value="">Select {input.name}</option>
                      {input.options.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                    {input.description && (
                      <p className="mt-1 text-xs text-zinc-500">{input.description}</p>
                    )}
                  </div>
                ) : input.type === "boolean" ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id={input.name}
                      checked={inputValues[input.name] === "true"}
                      onChange={(e) =>
                        handleInputChange(input.name, e.target.checked ? "true" : "false")
                      }
                      className="h-4 w-4 rounded border-zinc-300 dark:border-zinc-600"
                    />
                    <label
                      htmlFor={input.name}
                      className="text-sm font-medium text-zinc-600 dark:text-zinc-400"
                    >
                      {input.name}
                      {input.required && <span className="ml-1 text-red-500">*</span>}
                    </label>
                    {input.description && (
                      <span className="text-xs text-zinc-500">- {input.description}</span>
                    )}
                  </div>
                ) : (
                  <Input
                    label={
                      <>
                        {input.name}
                        {input.required && <span className="ml-1 text-red-500">*</span>}
                      </>
                    }
                    value={inputValues[input.name] || ""}
                    onChange={(e) => handleInputChange(input.name, e.target.value)}
                    placeholder={input.default || `Enter ${input.name}`}
                    helperText={input.description}
                  />
                )}
              </div>
            ))}
          </div>
        )}

        {selectedWorkflow && !isLoadingInputs && workflowInputs.length === 0 && (
          <p className="text-sm text-zinc-500">
            This workflow has no configurable inputs.
          </p>
        )}
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

      {error && (
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
          <span className="text-sm text-red-700 dark:text-red-300">{error}</span>
        </div>
      )}

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
