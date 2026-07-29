import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import { buildClientSession, persistGitHubIdentity } from "@/lib/auth/callbacks";
import { assertAuthEnv } from "@/lib/env";

assertAuthEnv();

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      authorization: {
        params: {
          // Request additional scopes for repository access
          scope: "read:user user:email repo workflow",
        },
      },
    }),
  ],
  callbacks: {
    // Both live in lib/auth/callbacks.ts so the boundary they draw -- access
    // token in the JWT, never in the session -- is unit-testable.
    async jwt({ token, account, profile }) {
      return persistGitHubIdentity({ token, account, profile });
    },
    async session({ session, token }) {
      return buildClientSession({ session, token });
    },
  },
});
