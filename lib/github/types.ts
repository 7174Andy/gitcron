export interface GitHubRepository {
  id: number;
  name: string;
  full_name: string;
  owner: {
    login: string;
  };
  private: boolean;
  description: string | null;
  updated_at: string;
}

export interface GitHubContent {
  name: string;
  path: string;
  sha: string;
  type: "file" | "dir";
}

export interface WorkflowFile {
  name: string;
  path: string;
}
