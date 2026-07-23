# Edit/Reschedule Design

## Problem

A pending schedule can currently only be created or deleted (`lib/actions/schedules.ts`). If a user picks the wrong time, repo, workflow, or input value, their only recourse is to cancel and recreate the schedule from scratch. This feature lets a user edit a schedule while it's still pending.

## Scope

Editable: repository, workflow, workflow inputs, date, time, timezone — i.e. everything the create flow (`ScheduleForm`) currently supports.

Explicitly out of scope: branch/ref selection. The `Schedule.ref` column defaults to `"main"` and isn't part of `SchedulePayload` or the create UI today, so there is nothing to "re-edit" for it. Adding branch selection is a separate feature.

Only schedules with `status === "pending"` are editable. Once a schedule is `triggered` or `failed` it's execution history and stays read-only, matching how `deleteSchedule` already treats those states.

No audit trail or edit history — the row is updated in place. `updatedAt` (already on the `Schedule` model) reflects the last edit.

## Data layer

Add `updateSchedule(id, { payload }): Promise<{ success: true; schedule: ScheduleResponse } | { success: false; error: string }>` to `lib/actions/schedules.ts`, next to `createSchedule`/`deleteSchedule`.

Behavior:

1. `auth()` — require a session, same as every other action here.
2. Re-encrypt the *current* session's GitHub access token (`encrypt(session.accessToken)`) into the update, same as `createSchedule` does on insert — covers the case where the token rotated since the schedule was first created.
3. Update atomically with a status guard to avoid a race against the cron poller (`/api/cron/execute`, which flips `pending` → `triggered`/`failed` via `updateScheduleStatus`):

   ```ts
   const result = await prisma.schedule.updateMany({
     where: { id, userId: session.user.id, status: "pending" },
     data: {
       owner: payload.repository.owner,
       repo: payload.repository.name,
       repoFullName: payload.repository.fullName,
       workflowName: payload.workflow.name,
       workflowPath: payload.workflow.path,
       inputs: payload.inputs,
       scheduledAt: new Date(payload.scheduledAt),
       timezone: payload.timezone,
       accessToken: encrypt(session.accessToken),
     },
   });
   ```

4. If `result.count === 0`, the row either doesn't belong to this user or is no longer pending (it got triggered/failed, or deleted, between the user opening the edit form and submitting). Return `{ success: false, error: "This schedule was already triggered and can no longer be edited." }`.
5. On success, re-fetch the row and return it through the existing `toScheduleResponse` mapper, same shape `createSchedule` returns.

## UI layer

**`ScheduleForm`** gains an optional prop:

```ts
interface ScheduleFormProps {
  onClose?: () => void;
  onScheduleCreated?: () => void; // fires on both create and edit success
  initialSchedule?: ScheduleResponse; // presence = edit mode
}
```

When `initialSchedule` is present:

- `date`/`time`/`timezone` state initialize from `scheduledAt` + `timezone` (converted with the existing `toZonedTime`/`format` helpers already used in `ScheduleCard`) instead of the "tomorrow at 9am" default.
- `inputValues` initializes from `initialSchedule.inputs`.
- `selectedRepo`/`selectedWorkflow` initialize from placeholder objects built directly out of the stored strings, since `RepositorySelect`/`WorkflowSelect` only report full objects back on user interaction, not on mount:

  ```ts
  const initialRepo: GitHubRepository = {
    id: 0,
    name: initialSchedule.repo,
    full_name: initialSchedule.repoFullName,
    owner: { login: initialSchedule.owner },
    private: false,
    description: null,
    updated_at: "",
  };
  const initialWorkflow: WorkflowFile = {
    name: initialSchedule.workflowName,
    path: initialSchedule.workflowPath,
  };
  ```

  (`WorkflowFile` is already exactly `{ name, path }`, so no placeholder fields needed there.)

- The workflow-inputs-loading `useEffect` (currently always overwrites `inputValues` with `input.default` for every input) must only fill in a default for keys **not already present** in `inputValues`, so it doesn't clobber the values carried over from `initialSchedule.inputs`:

  ```ts
  setInputValues((prev) => {
    const next = { ...prev };
    inputs.forEach((input) => {
      if (input.default && next[input.name] === undefined) {
        next[input.name] = input.default;
      }
    });
    return next;
  });
  ```

- `handleSubmit` calls `updateSchedule(initialSchedule.id, { payload })` instead of `createSchedule({ payload })` when in edit mode; everything else about validation/payload construction is unchanged.
- Submit button label reads "Save changes" instead of "Schedule" in edit mode.

**`HomeContent` / `ScheduleCard`**: add an "Edit" icon button next to the existing cancel (×) button, shown only when `schedule.status === "pending"`. Clicking it opens the same modal used for creation, passing `initialSchedule={schedule}`. The modal title reads "Edit Scheduled Workflow" instead of "Schedule a Workflow" when editing. On success, reuse the existing `fetchSchedules()` refresh path (`onScheduleCreated`).

## Error handling

- Stale-state race (guard described above): surfaced as a form-level error, same `error` banner `ScheduleForm` already renders for create failures. The modal stays open so the user doesn't lose their edits; they can close it manually and see the updated status in the list.
- All other validation (missing required inputs, past date/time) is already handled by existing `ScheduleForm` logic and applies unchanged to edit mode.

## Testing

Manual verification via `npm run dev` (no automated test suite exists in this repo currently):

1. Create a schedule, click Edit, change the date/time — confirm the list reflects the new time after save.
2. Edit a schedule's workflow inputs — confirm previously-set values are preserved and pre-filled, not reset to workflow defaults.
3. Edit a schedule's repository/workflow selection — confirm workflow inputs reload for the newly selected workflow.
4. Attempt to edit a schedule, then flip its status to `triggered` directly in the DB before submitting — confirm the atomic guard rejects the update with the "already triggered" error instead of silently overwriting a completed run.
5. Confirm schedules with `status !== "pending"` never show an Edit button.
