import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";

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
    async jwt({ token, account, profile }) {
      // Persist the OAuth access token and user ID to the JWT
      if (account) {
        token.accessToken = account.access_token;
      }
      if (profile) {
        // GitHub profile includes the user's ID
        token.userId = String(profile.id);
      }
      return token;
    },
    async session({ session, token }) {
      // Send the access token and user ID to the client
      session.accessToken = token.accessToken as string;
      if (session.user) {
        session.user.id = token.userId as string;
      }
      return session;
    },
  },
});
