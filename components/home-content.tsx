"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { ScheduleForm } from "@/components/schedule/schedule-form";
import { getSchedules, deleteSchedule, type ScheduleResponse } from "@/lib/actions/schedules";
import { scheduleBucket } from "@/types/schedule";

// The database only changes as fast as the cron tick that writes it (every
// 1 minute), so polling faster than this buys nothing. Background tabs are
// throttled by the browser for free.
const POLL_INTERVAL_MS = 10_000;

// A schedule read finishes in well under 100ms, so an indicator tied directly
// to the request would flash for a single frame every poll - jitter rather
// than feedback. Holding it this long makes each poll read as one deliberate
// pulse. Only affects the indicator; fetched data still renders immediately.
const MIN_INDICATOR_MS = 400;

function StatusBadge({
  status,
  runConclusion,
}: {
  status: string;
  runConclusion: string | null;
}) {
  const styles = {
    yellow: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
    blue: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    green: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    red: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
    zinc: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  };

  // status describes the dispatch; runConclusion describes the GitHub run
  // it created (null until the run completes or we give up).
  let label = status;
  let color: keyof typeof styles = "yellow";

  if (status === "pending") {
    label = "scheduled";
  } else if (status === "processing") {
    color = "blue";
  } else if (status === "failed") {
    color = "red";
  } else if (status === "triggered") {
    if (runConclusion === null) {
      label = "running…";
      color = "blue";
    } else if (runConclusion === "success") {
      label = "succeeded";
      color = "green";
    } else if (runConclusion === "failure" || runConclusion === "timed_out") {
      label = runConclusion === "failure" ? "run failed" : "timed out";
      color = "red";
    } else {
      // cancelled, unknown, skipped, stale, neutral, action_required
      label = runConclusion.replace(/_/g, " ");
      color = "zinc";
    }
  }

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${styles[color]}`}
    >
      {label}
    </span>
  );
}

function RefreshIcon({ className }: { className: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
      />
    </svg>
  );
}

function SectionHeader({
  label,
  count,
  isUpdating,
}: {
  label: string;
  count: number;
  isUpdating: boolean;
}) {
  return (
    <h3 className="flex items-center gap-2 text-sm font-medium text-zinc-600 dark:text-zinc-400">
      <span>
        {label} ({count})
      </span>
      {isUpdating && (
        // aria-hidden deliberately: this repeats on every poll, and a live
        // region announcing "updating" every 10 seconds would bury the thing
        // that actually changed. The status badges carry that information.
        <span
          aria-hidden="true"
          className="flex items-center gap-1 text-xs font-normal text-zinc-400 dark:text-zinc-500"
        >
          <RefreshIcon className="h-3 w-3 animate-spin motion-reduce:animate-none" />
          updating…
        </span>
      )}
    </h3>
  );
}

function ScheduleCard({
  schedule,
  onDelete,
  onEdit,
}: {
  schedule: ScheduleResponse;
  onDelete: (id: string) => void;
  onEdit: (schedule: ScheduleResponse) => void;
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
          <StatusBadge status={schedule.status} runConclusion={schedule.runConclusion} />
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
        {schedule.runUrl && (
          <a
            href={schedule.runUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-600 hover:underline dark:text-blue-400"
          >
            View run on GitHub ↗
          </a>
        )}
      </div>
      {schedule.status === "pending" && (
        <div className="flex items-center gap-1">
          <button
            onClick={() => onEdit(schedule)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
            title="Edit schedule"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
              />
            </svg>
          </button>
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
        </div>
      )}
    </div>
  );
}

export function HomeContent() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<ScheduleResponse | null>(null);
  const [schedules, setSchedules] = useState<ScheduleResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  // True for every read - the manual click and the background poll alike - so
  // the header indicator reflects any refresh, not just an explicit one.
  const [isFetching, setIsFetching] = useState(false);
  // Collapses overlapping fetches onto one request, so a slow response can
  // never land after a newer one and repaint "running…" over an
  // already-resolved "succeeded". Holds the promise rather than a boolean so
  // a caller that arrives mid-flight waits for the real result - that's what
  // keeps the Refresh spinner honest when a click races the poll timer.
  const inFlight = useRef<Promise<void> | null>(null);

  const fetchSchedules = useCallback(() => {
    if (inFlight.current) return inFlight.current;

    setIsFetching(true);
    const startedAt = Date.now();

    const request = (async () => {
      try {
        const result = await getSchedules();
        if (result.success) {
          setSchedules(result.schedules);
        }
      } finally {
        inFlight.current = null;
        setIsLoading(false);

        setTimeout(
          () => setIsFetching(false),
          Math.max(0, MIN_INDICATOR_MS - (Date.now() - startedAt)),
        );
      }
    })();

    inFlight.current = request;
    return request;
  }, []);

  useEffect(() => {
    (async () => {
      await fetchSchedules();
    })();
  }, [fetchSchedules]);

  const bucketed: Record<ReturnType<typeof scheduleBucket>, ScheduleResponse[]> = {
    scheduled: [],
    running: [],
    history: [],
  };
  for (const schedule of schedules) {
    bucketed[scheduleBucket(schedule.status, schedule.runConclusion)].push(schedule);
  }

  // Anything not in a terminal state can still change on its own, so keep
  // polling. A dashboard where every schedule has settled starts no timer and
  // issues no requests.
  const isActive = bucketed.scheduled.length > 0 || bucketed.running.length > 0;

  useEffect(() => {
    if (!isActive) return;

    const timer = setInterval(fetchSchedules, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [isActive, fetchSchedules]);

  function handleScheduleCreated() {
    fetchSchedules();
  }

  function handleScheduleDeleted(id: string) {
    setSchedules((prev) => prev.filter((s) => s.id !== id));
  }

  function handleEditSchedule(schedule: ScheduleResponse) {
    setEditingSchedule(schedule);
    setIsModalOpen(true);
  }

  function handleOpenCreateModal() {
    setEditingSchedule(null);
    setIsModalOpen(true);
  }

  function handleCloseModal() {
    setIsModalOpen(false);
    setEditingSchedule(null);
  }

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
              onClick={handleOpenCreateModal}
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
            <div className="flex items-center gap-2">
              <button
                onClick={() => fetchSchedules()}
                className="flex h-9 items-center gap-2 rounded-lg border border-zinc-200 px-3 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800"
                title="Refresh workflow status"
              >
                <RefreshIcon
                  className={`h-4 w-4 ${isFetching ? "animate-spin motion-reduce:animate-none" : ""}`}
                />
                Refresh
              </button>
              <button
                onClick={handleOpenCreateModal}
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
          </div>

          {(
            [
              ["Scheduled", bucketed.scheduled],
              ["Running", bucketed.running],
            ] as const
          ).map(([label, items]) =>
            items.length === 0 ? null : (
              <div key={label} className="flex flex-col gap-3">
                <SectionHeader label={label} count={items.length} isUpdating={isFetching} />
                <div className="flex flex-col gap-2">
                  {items.map((schedule) => (
                    <ScheduleCard
                      key={schedule.id}
                      schedule={schedule}
                      onDelete={handleScheduleDeleted}
                      onEdit={handleEditSchedule}
                    />
                  ))}
                </div>
              </div>
            ),
          )}

          {bucketed.history.length > 0 && (
            <details>
              <summary className="cursor-pointer text-sm font-medium text-zinc-600 dark:text-zinc-400">
                History ({bucketed.history.length})
              </summary>
              <div className="mt-3 flex flex-col gap-2">
                {bucketed.history.map((schedule) => (
                  <ScheduleCard
                    key={schedule.id}
                    schedule={schedule}
                    onDelete={handleScheduleDeleted}
                    onEdit={handleEditSchedule}
                  />
                ))}
              </div>
            </details>
          )}
        </div>
      )}

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={handleCloseModal}
          />

          {/* Modal content */}
          <div className="relative z-10 w-full max-w-lg rounded-xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">
                {editingSchedule ? "Edit Scheduled Workflow" : "Schedule a Workflow"}
              </h2>
              <button
                onClick={handleCloseModal}
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
              onClose={handleCloseModal}
              onScheduleCreated={handleScheduleCreated}
              initialSchedule={editingSchedule ?? undefined}
            />
          </div>
        </div>
      )}
    </>
  );
}
