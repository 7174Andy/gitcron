"use client";

import { useEffect, useState, useTransition } from "react";
import { Select, SelectOption } from "@/components/ui/select";
import { SelectSkeleton } from "@/components/ui/skeleton";
import { fetchWorkflows } from "@/lib/actions/github";
import type { WorkflowFile } from "@/lib/github/types";

interface WorkflowSelectProps {
  owner: string | null;
  repo: string | null;
  value: string | null;
  onChange: (value: string, workflow: WorkflowFile) => void;
}

export function WorkflowSelect({
  owner,
  repo,
  value,
  onChange,
}: WorkflowSelectProps) {
  const [workflows, setWorkflows] = useState<WorkflowFile[]>([]);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!owner || !repo) {
      setWorkflows([]);
      return;
    }

    setIsLoading(true);
    startTransition(async () => {
      try {
        const files = await fetchWorkflows(owner, repo);
        setWorkflows(files);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load workflows");
      } finally {
        setIsLoading(false);
      }
    });
  }, [owner, repo]);

  if (!owner || !repo) {
    return (
      <Select
        options={[]}
        value={null}
        onChange={() => {}}
        placeholder="Select workflow..."
        disabled
      />
    );
  }

  if (isLoading || isPending) {
    return <SelectSkeleton />;
  }

  if (error) {
    return (
      <div className="flex h-10 items-center rounded-lg border border-red-200 bg-red-50 px-3 text-sm text-red-600 dark:border-red-900 dark:bg-red-950 dark:text-red-400">
        {error}
      </div>
    );
  }

  if (workflows.length === 0) {
    return (
      <div className="flex h-10 items-center rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
        No workflows found in .github/workflows
      </div>
    );
  }

  const options: SelectOption[] = workflows.map((workflow) => ({
    value: workflow.path,
    label: workflow.name,
    description: workflow.path,
  }));

  function handleChange(path: string) {
    const workflow = workflows.find((w) => w.path === path);
    if (workflow) {
      onChange(path, workflow);
    }
  }

  return (
    <Select
      options={options}
      value={value}
      onChange={handleChange}
      placeholder="Select workflow..."
    />
  );
}
