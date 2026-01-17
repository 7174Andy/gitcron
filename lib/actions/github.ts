"use server";

import { auth } from "@/auth";
import type { GitHubRepository, GitHubContent, WorkflowFile } from "@/lib/github/types";

export async function fetchRepositories(): Promise<GitHubRepository[]> {
  const session = await auth();

  if (!session?.accessToken) {
    throw new Error("Not authenticated");
  }

  const response = await fetch(
    "https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member",
    {
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        Accept: "application/vnd.github.v3+json",
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch repositories: ${response.statusText}`);
  }

  return response.json();
}

export async function fetchWorkflows(
  owner: string,
  repo: string
): Promise<WorkflowFile[]> {
  const session = await auth();

  if (!session?.accessToken) {
    throw new Error("Not authenticated");
  }

  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/.github/workflows`,
    {
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        Accept: "application/vnd.github.v3+json",
      },
    }
  );

  if (!response.ok) {
    if (response.status === 404) {
      return [];
    }
    throw new Error(`Failed to fetch workflows: ${response.statusText}`);
  }

  const contents: GitHubContent[] = await response.json();

  return contents
    .filter(
      (file) =>
        file.type === "file" &&
        (file.name.endsWith(".yml") || file.name.endsWith(".yaml"))
    )
    .map((file) => ({
      name: file.name,
      path: file.path,
    }));
}
