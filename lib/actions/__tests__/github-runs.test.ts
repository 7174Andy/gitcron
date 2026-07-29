import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/access-token", () => ({ getGitHubAccessToken: vi.fn() }));

import {
  listWorkflowRunsWithToken,
  getWorkflowRunWithToken,
} from "@/lib/actions/github";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("listWorkflowRunsWithToken", () => {
  it("queries the workflow's runs filtered by event, branch, and created window", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        workflow_runs: [
          {
            id: 42,
            html_url: "https://github.com/o/r/actions/runs/42",
            status: "completed",
            conclusion: "success",
            created_at: "2026-07-24T12:00:05Z",
          },
        ],
      })
    );

    const result = await listWorkflowRunsWithToken(
      "tok",
      "o",
      "r",
      ".github/workflows/ci.yml",
      "main",
      "2026-07-24T11:58:00Z"
    );

    expect(result.success).toBe(true);
    expect(result.runs).toEqual([
      {
        id: 42,
        htmlUrl: "https://github.com/o/r/actions/runs/42",
        status: "completed",
        conclusion: "success",
        createdAt: "2026-07-24T12:00:05Z",
      },
    ]);

    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.pathname).toBe("/repos/o/r/actions/workflows/ci.yml/runs");
    expect(url.searchParams.get("event")).toBe("workflow_dispatch");
    expect(url.searchParams.get("branch")).toBe("main");
    expect(url.searchParams.get("created")).toBe(">=2026-07-24T11:58:00Z");
  });

  it("strips milliseconds from createdAfter so GitHub's created qualifier accepts it", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ workflow_runs: [] }));

    await listWorkflowRunsWithToken(
      "tok",
      "o",
      "r",
      ".github/workflows/ci.yml",
      "main",
      "2026-07-24T11:58:00.123Z"
    );

    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.searchParams.get("created")).toBe(">=2026-07-24T11:58:00Z");
  });

  it("passes an already-clean createdAfter through unchanged", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ workflow_runs: [] }));

    await listWorkflowRunsWithToken(
      "tok",
      "o",
      "r",
      ".github/workflows/ci.yml",
      "main",
      "2026-07-24T11:58:00Z"
    );

    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.searchParams.get("created")).toBe(">=2026-07-24T11:58:00Z");
  });

  it("returns success with an empty list when GitHub has no matching runs", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ workflow_runs: [] }));

    const result = await listWorkflowRunsWithToken(
      "tok", "o", "r", ".github/workflows/ci.yml", "main", "2026-07-24T11:58:00Z"
    );

    expect(result).toEqual({ success: true, runs: [] });
  });

  it("returns an error result on a non-OK response", async () => {
    fetchMock.mockResolvedValue(new Response("nope", { status: 403, statusText: "Forbidden" }));

    const result = await listWorkflowRunsWithToken(
      "tok", "o", "r", ".github/workflows/ci.yml", "main", "2026-07-24T11:58:00Z"
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("403");
  });
});

describe("getWorkflowRunWithToken", () => {
  it("fetches a single run and maps its fields", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        id: 42,
        html_url: "https://github.com/o/r/actions/runs/42",
        status: "in_progress",
        conclusion: null,
        created_at: "2026-07-24T12:00:05Z",
      })
    );

    const result = await getWorkflowRunWithToken("tok", "o", "r", 42);

    expect(result.success).toBe(true);
    expect(result.run).toEqual({
      id: 42,
      htmlUrl: "https://github.com/o/r/actions/runs/42",
      status: "in_progress",
      conclusion: null,
      createdAt: "2026-07-24T12:00:05Z",
    });
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://api.github.com/repos/o/r/actions/runs/42"
    );
  });

  it("returns an error result when fetch rejects", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));

    const result = await getWorkflowRunWithToken("tok", "o", "r", 42);

    expect(result).toEqual({ success: false, error: "network down" });
  });
});
