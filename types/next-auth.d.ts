import { DefaultSession } from "next-auth";

declare module "next-auth" {
  // No accessToken here on purpose. The session is serialised to the browser by
  // GET /api/auth/session; the GitHub token stays in the JWT and is read
  // server-side with getGitHubAccessToken().
  interface Session {
    user: DefaultSession["user"] & {
      id?: string;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    accessToken?: string;
    userId?: string;
  }
}
