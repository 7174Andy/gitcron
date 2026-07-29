import { describe, expect, it } from "vitest";
import type { Account, Profile, Session } from "next-auth";
import type { JWT } from "next-auth/jwt";
import { buildClientSession, persistGitHubIdentity } from "@/lib/auth/callbacks";

const ACCESS_TOKEN = "gho_0123456789abcdef0123456789abcdef0123";

function makeSession(): Session {
  return {
    expires: "2099-01-01T00:00:00.000Z",
    user: { name: "Octocat", email: "octocat@example.com" },
  };
}

describe("persistGitHubIdentity", () => {
  it("keeps the access token in the JWT", () => {
    const token = persistGitHubIdentity({
      token: {},
      account: { access_token: ACCESS_TOKEN } as Account,
    });

    expect(token.accessToken).toBe(ACCESS_TOKEN);
  });

  it("records the GitHub numeric id as the user id", () => {
    const token = persistGitHubIdentity({
      token: {},
      // GitHub sends a number here, though Profile types `id` as a string --
      // which is exactly why the callback coerces it.
      profile: { id: 583231 } as unknown as Profile,
    });

    expect(token.userId).toBe("583231");
  });

  it("leaves an existing token untouched on later calls", () => {
    // `account` and `profile` are only present on the sign-in call; every
    // subsequent request must not clear what the first one stored.
    const first = persistGitHubIdentity({
      token: {},
      account: { access_token: ACCESS_TOKEN } as Account,
      // GitHub sends a number here, though Profile types `id` as a string --
      // which is exactly why the callback coerces it.
      profile: { id: 583231 } as unknown as Profile,
    });

    const second = persistGitHubIdentity({ token: first });

    expect(second.accessToken).toBe(ACCESS_TOKEN);
    expect(second.userId).toBe("583231");
  });
});

describe("buildClientSession", () => {
  it("exposes the user id", () => {
    const session = buildClientSession({
      session: makeSession(),
      token: { userId: "583231" },
    });

    expect(session.user.id).toBe("583231");
  });

  // The session object this returns is the response body of
  // GET /api/auth/session, which SessionProvider fetches into the browser on
  // every page load. A `repo`-scoped GitHub token placed here would be readable
  // by any script running on the origin, defeating the httpOnly session cookie.
  it("never carries the GitHub access token", () => {
    const token: JWT = { accessToken: ACCESS_TOKEN, userId: "583231" };

    const session = buildClientSession({ session: makeSession(), token });

    expect(session).not.toHaveProperty("accessToken");
    expect(JSON.stringify(session)).not.toContain(ACCESS_TOKEN);
  });
});
