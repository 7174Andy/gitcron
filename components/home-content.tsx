"use client";

import { useState, useEffect, useCallback } from "react";
import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { ScheduleForm } from "@/components/schedule/schedule-form";
import { getSchedules, deleteSchedule, type ScheduleResponse } from "@/lib/actions/schedules";

function StatusBadge({ status }: { status: string }) {
  const styles = {
    pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
    triggered: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    failed: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
        styles[status as keyof typeof styles] || styles.pending
      }`}
    >
      {status}
    </span>
  );
}

function ScheduleCard({
  schedule,
  onDelete,
}: {
  schedule: ScheduleResponse;
  onDelete: (id: string) => void;
}) {
  const [isDeleting, setIsDeleting] = useState(false);

  const scheduledDate = toZonedTime(new Date(schedule.scheduledAt), schedule.timezone);
  const formattedDate = format(scheduledDate, "MMM d, yyyy");
  const formattedTime = format(scheduledDate, "h:mm a");

  async function handleDelete() {
    if (!confirm("Are you sure you want to cancel this scheduled workflow?")) {
      return;
    }

    setIsDeleting(true);
    try {
      const result = await deleteSchedule(schedule.id);
      if (result.success) {
        onDelete(schedule.id);
      } else {
        alert(result.error);
      }
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-zinc-900 dark:text-white">
            {schedule.workflowName}
          </span>
          <StatusBadge status={schedule.status} />
        </div>
        <div className="flex items-center gap-2 text-sm text-zinc-500">
          <span>{schedule.repoFullName}</span>
          <span>·</span>
          <span>
            {formattedDate} at {formattedTime}
          </span>
        </div>
        {Object.keys(schedule.inputs).length > 0 && (
          <div className="flex flex-wrap gap-1">
            {Object.entries(schedule.inputs).map(([key, value]) => (
              <span
                key={key}
                className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
              >
                {key}: {value}
              </span>
            ))}
          </div>
        )}
        {schedule.errorMessage && (
          <span className="text-xs text-red-500">Error: {schedule.errorMessage}</span>
        )}
      </div>
      {schedule.status === "pending" && (
        <button
          onClick={handleDelete}
          disabled={isDeleting}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 disabled:opacity-50 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
          title="Cancel schedule"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      )}
    </div>
  );
}

export function HomeContent() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [schedules, setSchedules] = useState<ScheduleResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchSchedules = useCallback(async () => {
    const result = await getSchedules();
    if (result.success) {
      setSchedules(result.schedules);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    fetchSchedules();
  }, [fetchSchedules]);

  function handleScheduleCreated() {
    fetchSchedules();
  }

  function handleScheduleDeleted(id: string) {
    setSchedules((prev) => prev.filter((s) => s.id !== id));
  }

  const pendingSchedules = schedules.filter((s) => s.status === "pending");
  const completedSchedules = schedules.filter((s) => s.status !== "pending");

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-600" />
      </div>
    );
  }

  return (
    <>
      {schedules.length === 0 ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-8 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800">
              <svg
                className="h-6 w-6 text-zinc-400"
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
            </div>
            <div className="flex flex-col gap-1">
              <h3 className="font-medium text-zinc-900 dark:text-white">
                No scheduled workflows
              </h3>
              <p className="text-sm text-zinc-500 dark:text-zinc-500">
                Create your first scheduled workflow to get started.
              </p>
            </div>
            <button
              onClick={() => setIsModalOpen(true)}
              className="mt-2 flex h-10 items-center justify-center rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100"
            >
              Schedule a workflow
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">
              Scheduled Workflows
            </h2>
            <button
              onClick={() => setIsModalOpen(true)}
              className="flex h-9 items-center gap-2 rounded-lg bg-zinc-900 px-3 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
              New Schedule
            </button>
          </div>

          {pendingSchedules.length > 0 && (
            <div className="flex flex-col gap-3">
              <h3 className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
                Pending ({pendingSchedules.length})
              </h3>
              <div className="flex flex-col gap-2">
                {pendingSchedules.map((schedule) => (
                  <ScheduleCard
                    key={schedule.id}
                    schedule={schedule}
                    onDelete={handleScheduleDeleted}
                  />
                ))}
              </div>
            </div>
          )}

          {completedSchedules.length > 0 && (
            <div className="flex flex-col gap-3">
              <h3 className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
                History ({completedSchedules.length})
              </h3>
              <div className="flex flex-col gap-2">
                {completedSchedules.map((schedule) => (
                  <ScheduleCard
                    key={schedule.id}
                    schedule={schedule}
                    onDelete={handleScheduleDeleted}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setIsModalOpen(false)}
          />

          {/* Modal content */}
          <div className="relative z-10 w-full max-w-lg rounded-xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">
                Schedule a Workflow
              </h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
              >
                <svg
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
            <ScheduleForm
              onClose={() => setIsModalOpen(false)}
              onScheduleCreated={handleScheduleCreated}
            />
          </div>
        </div>
      )}
    </>
  );
}
