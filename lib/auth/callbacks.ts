import type { Account, Profile, Session } from "next-auth";
import type { JWT } from "next-auth/jwt";

/**
 * Stores the GitHub access token and user id on the JWT at sign-in.
 *
 * `account` and `profile` are only supplied on the sign-in call; every later
 * request re-enters with the token already populated, so both writes are
 * conditional.
 *
 * The JWT is where the access token lives and the only place it lives. Auth.js
 * encrypts it (A256CBC-HS512) into an httpOnly cookie, so it stays on the
 * server -- see `buildClientSession` for the part the browser does see, and
 * `lib/auth/access-token.ts` for how server code reads the token back.
 */
export function persistGitHubIdentity({
  token,
  account,
  profile,
}: {
  token: JWT;
  account?: Account | null;
  profile?: Profile | null;
}): JWT {
  if (account) {
    token.accessToken = account.access_token;
  }
  if (profile) {
    // GitHub's numeric account id, which is stable across username changes.
    token.userId = String(profile.id);
  }
  return token;
}

/**
 * Builds the session object handed to the browser.
 *
 * Whatever this returns becomes the response body of GET /api/auth/session,
 * which `SessionProvider` fetches on every page load. So it must carry nothing
 * that a script running on the origin should not have: notably not the GitHub
 * access token, which is scoped `repo workflow` and does not expire. Server
 * code that needs the token reads it from the JWT with
 * `getGitHubAccessToken()` instead.
 */
export function buildClientSession({
  session,
  token,
}: {
  session: Session;
  token: JWT;
}): Session {
  if (session.user) {
    session.user.id = token.userId;
  }
  return session;
}
