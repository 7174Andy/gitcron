import { describe, expect, it } from "vitest";
import { assertAuthEnv } from "@/lib/env";

function completeEnv(): Record<string, string | undefined> {
  return {
    AUTH_SECRET: "PDgbGGf0kQ0lKZ0PPX3xRXjCVfjT7pQoLYEHYw3nnkw=",
    GITHUB_CLIENT_ID: "Ov23liExampleClientId",
    GITHUB_CLIENT_SECRET: "0123456789abcdef0123456789abcdef01234567",
  };
}

describe("assertAuthEnv", () => {
  it("passes when every required variable is set", () => {
    expect(() => assertAuthEnv(completeEnv())).not.toThrow();
  });

  it("names an undefined variable", () => {
    const env = completeEnv();
    delete env.GITHUB_CLIENT_ID;

    expect(() => assertAuthEnv(env)).toThrow(/GITHUB_CLIENT_ID/);
  });

  // `cp .env.example .env` leaves every key present but blank. Auth.js fills
  // provider credentials with `??=`, so "" is not nullish and never falls back
  // to AUTH_GITHUB_ID -- the sign-in then fails with an opaque error.
  it("treats an empty value as missing", () => {
    const env = completeEnv();
    env.GITHUB_CLIENT_SECRET = "";

    expect(() => assertAuthEnv(env)).toThrow(/GITHUB_CLIENT_SECRET/);
  });

  it("treats a whitespace-only value as missing", () => {
    const env = completeEnv();
    env.AUTH_SECRET = "   ";

    expect(() => assertAuthEnv(env)).toThrow(/AUTH_SECRET/);
  });

  it("reports every missing variable in one error", () => {
    const error = getError(() => assertAuthEnv({}));

    expect(error.message).toContain("AUTH_SECRET");
    expect(error.message).toContain("GITHUB_CLIENT_ID");
    expect(error.message).toContain("GITHUB_CLIENT_SECRET");
  });

  it("tells the reader how to fix it", () => {
    const error = getError(() => assertAuthEnv({}));

    // The dev callback URL is the whole reason a second OAuth App is needed.
    expect(error.message).toContain(
      "http://localhost:3000/api/auth/callback/github",
    );
    expect(error.message).toContain(".env.local");
  });

  it("does not require unrelated variables", () => {
    const env = completeEnv();
    delete env.DATABASE_URL;
    delete env.CRON_SECRET;
    delete env.ENCRYPTION_KEY;

    expect(() => assertAuthEnv(env)).not.toThrow();
  });
});

function getError(fn: () => void): Error {
  try {
    fn();
  } catch (error) {
    return error as Error;
  }
  throw new Error("expected the function to throw, but it did not");
}
