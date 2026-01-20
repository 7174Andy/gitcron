"use server";

import { auth } from "@/auth";
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
  const session = await auth();

  if (!session?.accessToken) {
    throw new Error("Not authenticated");
  }

  try {
    // Fetch the workflow file content
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${workflowPath}`,
      {
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
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
  const session = await auth();

  if (!session?.accessToken) {
    return { success: false, error: "Not authenticated" };
  }

  return triggerWorkflowDispatchWithToken(
    session.accessToken,
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
