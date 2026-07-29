"use server";

import { getGitHubAccessToken } from "@/lib/auth/access-token";
import { parse as parseYaml } from "yaml";
import type {
  GitHubRepository,
  GitHubContent,
  WorkflowFile,
  WorkflowInput,
} from "@/lib/github/types";

export interface WorkflowDispatchResult {
  success: boolean;
  error?: string;
}

export async function fetchRepositories(): Promise<GitHubRepository[]> {
  const accessToken = await getGitHubAccessToken();

  if (!accessToken) {
    throw new Error("Not authenticated");
  }

  const response = await fetch(
    "https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member",
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github.v3+json",
      },
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch repositories: ${response.statusText}`);
  }

  return response.json();
}

export async function fetchWorkflows(
  owner: string,
  repo: string,
): Promise<WorkflowFile[]> {
  const accessToken = await getGitHubAccessToken();

  if (!accessToken) {
    throw new Error("Not authenticated");
  }

  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/.github/workflows`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github.v3+json",
      },
    },
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
        (file.name.endsWith(".yml") || file.name.endsWith(".yaml")),
    )
    .map((file) => ({
      name: file.name,
      path: file.path,
    }));
}

export async function fetchWorkflowInputs(
  owner: string,
  repo: string,
  workflowPath: string
): Promise<WorkflowInput[]> {
  const accessToken = await getGitHubAccessToken();

  if (!accessToken) {
    throw new Error("Not authenticated");
  }

  try {
    // Fetch the workflow file content
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${workflowPath}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/vnd.github.v3.raw",
        },
      }
    );

    if (!response.ok) {
      console.error(`Failed to fetch workflow file: ${response.status}`);
      return [];
    }

    const content = await response.text();
    const workflow = parseYaml(content);

    // Extract workflow_dispatch inputs
    const dispatchInputs = workflow?.on?.workflow_dispatch?.inputs;

    if (!dispatchInputs) {
      return [];
    }

    // Convert to array format
    return Object.entries(dispatchInputs).map(([name, config]) => {
      const inputConfig = config as {
        description?: string;
        required?: boolean;
        default?: string;
        type?: string;
        options?: string[];
      };

      return {
        name,
        description: inputConfig.description,
        required: inputConfig.required ?? false,
        default: inputConfig.default,
        type: (inputConfig.type as WorkflowInput["type"]) || "string",
        options: inputConfig.options,
      };
    });
  } catch (error) {
    console.error("Failed to parse workflow inputs:", error);
    return [];
  }
}

export async function triggerWorkflowDispatch(
  owner: string,
  repo: string,
  workflowPath: string,
  ref: string = "main",
  inputs?: Record<string, string>,
): Promise<WorkflowDispatchResult> {
  const accessToken = await getGitHubAccessToken();

  if (!accessToken) {
    return { success: false, error: "Not authenticated" };
  }

  return triggerWorkflowDispatchWithToken(
    accessToken,
    owner,
    repo,
    workflowPath,
    ref,
    inputs,
  );
}

// Internal function that accepts token directly (for cron job use)
/**
 * Sends a POST API Request to GitHub for Dispatch Workflow to Run
 *
 * @param accessToken Access Token for GitHub
 * @param owner Owner of the Repository
 * @param repo Repository in GitHub to run the workflow
 * @param workflowPath Path of the Workflow in GitHub
 * @param ref Branch where the workflow would run
 * @param inputs Any inputs for Dispatch Workflow
 * @returns The status of running the API request
 */
export async function triggerWorkflowDispatchWithToken(
  accessToken: string,
  owner: string,
  repo: string,
  workflowPath: string,
  ref: string = "main",
  inputs?: Record<string, string>,
): Promise<WorkflowDispatchResult> {
  try {
    // Extract workflow file name from path
    const workflowId = workflowPath.split("/").pop();

    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflowId}/dispatches`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/vnd.github.v3+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ref,
          inputs: inputs ?? {},
        }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `Workflow dispatch failed: ${response.status} - ${errorText}`,
      );
      return {
        success: false,
        error: `GitHub API error: ${response.status} - ${response.statusText}`,
      };
    }

    // GitHub returns 204 No Content on success
    return { success: true };
  } catch (error) {
    console.error("Failed to trigger workflow dispatch:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export interface WorkflowRunSummary {
  id: number;
  htmlUrl: string;
  status: string;
  conclusion: string | null;
  createdAt: string;
}

export interface ListWorkflowRunsResult {
  success: boolean;
  runs?: WorkflowRunSummary[];
  error?: string;
}

export interface GetWorkflowRunResult {
  success: boolean;
  run?: WorkflowRunSummary;
  error?: string;
}

interface RawWorkflowRun {
  id: number;
  html_url: string;
  status: string;
  conclusion: string | null;
  created_at: string;
}

function toRunSummary(run: RawWorkflowRun): WorkflowRunSummary {
  return {
    id: run.id,
    htmlUrl: run.html_url,
    status: run.status,
    conclusion: run.conclusion,
    createdAt: run.created_at,
  };
}

// Lists workflow_dispatch runs of one workflow created at/after `createdAfter`
// (ISO timestamp), on one branch. Used by the cron resolution pass to locate
// the run a dispatch created, since the dispatch API returns no run id.
export async function listWorkflowRunsWithToken(
  accessToken: string,
  owner: string,
  repo: string,
  workflowPath: string,
  branch: string,
  createdAfter: string,
): Promise<ListWorkflowRunsResult> {
  try {
    const workflowId = workflowPath.split("/").pop();
    // GitHub's `created` qualifier expects YYYY-MM-DDTHH:MM:SS+00:00 or
    // ...SSZ - no fractional seconds. `createdAfter` is typically produced
    // via `Date#toISOString()`, which always includes milliseconds, so strip
    // them here to keep the query well-formed regardless of caller.
    const createdAfterParam = createdAfter.replace(/\.\d{3}Z$/, "Z");
    const params = new URLSearchParams({
      event: "workflow_dispatch",
      branch,
      created: `>=${createdAfterParam}`,
      per_page: "100",
    });

    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflowId}/runs?${params}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/vnd.github.v3+json",
        },
      },
    );

    if (!response.ok) {
      console.error(`List workflow runs failed: ${response.status}`);
      return {
        success: false,
        error: `GitHub API error: ${response.status} - ${response.statusText}`,
      };
    }

    const data = (await response.json()) as { workflow_runs?: RawWorkflowRun[] };
    return { success: true, runs: (data.workflow_runs ?? []).map(toRunSummary) };
  } catch (error) {
    console.error("Failed to list workflow runs:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function getWorkflowRunWithToken(
  accessToken: string,
  owner: string,
  repo: string,
  runId: number,
): Promise<GetWorkflowRunResult> {
  try {
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/actions/runs/${runId}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/vnd.github.v3+json",
        },
      },
    );

    if (!response.ok) {
      console.error(`Get workflow run failed: ${response.status}`);
      return {
        success: false,
        error: `GitHub API error: ${response.status} - ${response.statusText}`,
      };
    }

    const run = (await response.json()) as RawWorkflowRun;
    return { success: true, run: toRunSummary(run) };
  } catch (error) {
    console.error("Failed to get workflow run:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
