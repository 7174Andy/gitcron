import { headers } from "next/headers";
import { getToken } from "next-auth/jwt";

/**
 * Auth.js names the session cookie with a `__Secure-` prefix when it is serving
 * over HTTPS, which is every deployed environment but not localhost. The name
 * doubles as the encryption salt, so it has to be right -- rather than infer it
 * from the environment, read which one the request actually carries.
 */
const SESSION_COOKIE = "authjs.session-token";
const SECURE_SESSION_COOKIE = `__Secure-${SESSION_COOKIE}`;

/**
 * Reads the caller's GitHub access token out of the session JWT.
 *
 * The token is deliberately absent from the session object (see
 * `buildClientSession`), because that object is served to the browser. This is
 * how server code gets it instead: decrypt the httpOnly session cookie in
 * place. Nothing here ever reaches a response.
 *
 * Returns null when there is no valid session, so callers treat a missing token
 * exactly as they treat a missing session -- the JWE's signature and expiry are
 * verified during decryption, so a token coming back means the session is good.
 */
export async function getGitHubAccessToken(): Promise<string | null> {
  const cookieHeader = (await headers()).get("cookie");

  if (!cookieHeader) return null;

  const token = await getToken({
    // Only the cookie is passed through. getToken() otherwise falls back to a
    // bearer token in the Authorization header, and a server action is reachable
    // by POST with arbitrary headers -- the caller must not get to choose which
    // session is read.
    req: { headers: { cookie: cookieHeader } },
    secret: process.env.AUTH_SECRET,
    secureCookie: cookieHeader.includes(SECURE_SESSION_COOKIE),
  });

  return token?.accessToken ?? null;
}
