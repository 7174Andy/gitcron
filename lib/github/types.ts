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

export interface WorkflowInput {
  name: string;
  description?: string;
  required: boolean;
  default?: string;
  type: "string" | "boolean" | "choice" | "environment";
  options?: string[]; // For choice type
}

export interface WorkflowInputs {
  [key: string]: WorkflowInput;
}
