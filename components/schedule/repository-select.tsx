"use client";

import { useEffect, useState, useTransition } from "react";
import { Select, SelectOption } from "@/components/ui/select";
import { SelectSkeleton } from "@/components/ui/skeleton";
import { fetchRepositories } from "@/lib/actions/github";
import type { GitHubRepository } from "@/lib/github/types";

interface RepositorySelectProps {
  value: string | null;
  onChange: (value: string, repo: GitHubRepository) => void;
}

export function RepositorySelect({ value, onChange }: RepositorySelectProps) {
  const [repositories, setRepositories] = useState<GitHubRepository[]>([]);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    startTransition(async () => {
      try {
        const repos = await fetchRepositories();
        setRepositories(repos);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load repositories");
      } finally {
        setIsLoading(false);
      }
    });
  }, []);

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

  const options: SelectOption[] = repositories.map((repo) => ({
    value: repo.full_name,
    label: repo.full_name,
    description: repo.private ? "Private" : "Public",
  }));

  function handleChange(fullName: string) {
    const repo = repositories.find((r) => r.full_name === fullName);
    if (repo) {
      onChange(fullName, repo);
    }
  }

  return (
    <Select
      options={options}
      value={value}
      onChange={handleChange}
      placeholder="Select repository..."
      searchable
    />
  );
}
