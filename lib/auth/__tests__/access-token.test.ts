import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { encode } from "@auth/core/jwt";

const { headersMock } = vi.hoisted(() => ({ headersMock: vi.fn() }));

vi.mock("next/headers", () => ({ headers: headersMock }));

import { getGitHubAccessToken } from "@/lib/auth/access-token";

const SECRET = "PDgbGGf0kQ0lKZ0PPX3xRXjCVfjT7pQoLYEHYw3nnkw=";
const ACCESS_TOKEN = "gho_0123456789abcdef0123456789abcdef0123";
const INSECURE_COOKIE = "authjs.session-token";
const SECURE_COOKIE = "__Secure-authjs.session-token";

/** A session cookie value as Auth.js would have written it. */
function sessionJwe(cookieName: string): Promise<string> {
  // Auth.js salts the encryption with the cookie name, so the salt has to match
  // the name the value is stored under.
  return encode({
    salt: cookieName,
    secret: SECRET,
    token: { accessToken: ACCESS_TOKEN, userId: "583231" },
  });
}

function requestHeaders(init: Record<string, string>) {
  headersMock.mockResolvedValue(new Headers(init));
}

beforeEach(() => {
  vi.stubEnv("AUTH_SECRET", SECRET);
  headersMock.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getGitHubAccessToken", () => {
  it("reads the token out of the session cookie", async () => {
    requestHeaders({
      cookie: `${INSECURE_COOKIE}=${await sessionJwe(INSECURE_COOKIE)}`,
    });

    await expect(getGitHubAccessToken()).resolves.toBe(ACCESS_TOKEN);
  });

  // Auth.js prefixes the cookie with __Secure- when it is serving over HTTPS,
  // which is every deployed environment. The salt changes with the name, so
  // reading production's cookie with the development name yields nothing.
  it("reads the __Secure- prefixed cookie the deployed app sets", async () => {
    requestHeaders({
      cookie: `${SECURE_COOKIE}=${await sessionJwe(SECURE_COOKIE)}`,
    });

    await expect(getGitHubAccessToken()).resolves.toBe(ACCESS_TOKEN);
  });

  it("finds the cookie among others", async () => {
    requestHeaders({
      cookie: `theme=dark; ${INSECURE_COOKIE}=${await sessionJwe(INSECURE_COOKIE)}; other=1`,
    });

    await expect(getGitHubAccessToken()).resolves.toBe(ACCESS_TOKEN);
  });

  it("returns null when there is no cookie at all", async () => {
    requestHeaders({});

    await expect(getGitHubAccessToken()).resolves.toBeNull();
  });

  it("returns null when the session cookie is absent", async () => {
    requestHeaders({ cookie: "theme=dark" });

    await expect(getGitHubAccessToken()).resolves.toBeNull();
  });

  it("returns null rather than throwing on a cookie it cannot decrypt", async () => {
    requestHeaders({ cookie: `${INSECURE_COOKIE}=not-a-jwe` });

    await expect(getGitHubAccessToken()).resolves.toBeNull();
  });

  it("returns null when the cookie was encrypted with another secret", async () => {
    const foreign = await encode({
      salt: INSECURE_COOKIE,
      secret: "a-different-secret-entirely-0000000000000000",
      token: { accessToken: ACCESS_TOKEN },
    });
    requestHeaders({ cookie: `${INSECURE_COOKIE}=${foreign}` });

    await expect(getGitHubAccessToken()).resolves.toBeNull();
  });

  // getToken() also accepts a bearer token in the Authorization header. Server
  // actions are reachable by POST with arbitrary headers, so only the cookie is
  // ever consulted -- the caller must not get to choose which session is read.
  it("ignores a session token offered in the Authorization header", async () => {
    requestHeaders({
      authorization: `Bearer ${await sessionJwe(INSECURE_COOKIE)}`,
    });

    await expect(getGitHubAccessToken()).resolves.toBeNull();
  });
});
