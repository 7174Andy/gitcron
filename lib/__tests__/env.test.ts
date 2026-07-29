import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { assertAuthEnv, assertNotProductionDatabase } from "@/lib/env";
import {
  isProductionDatabase,
  PROD_DB_USER_SHA256,
} from "@/lib/dev-db-guard.mjs";

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
    expect(error.message).toContain(".env");
  });

  it("does not require unrelated variables", () => {
    const env = completeEnv();
    delete env.DATABASE_URL;
    delete env.CRON_SECRET;
    delete env.ENCRYPTION_KEY;

    expect(() => assertAuthEnv(env)).not.toThrow();
  });
});

describe("assertNotProductionDatabase", () => {
  // Stand-in for the real production username; the guard only ever compares
  // hashes, so any pair of distinct usernames exercises the same logic.
  const PROD_USER = "prod-user-0000";
  const PROD_SHA = createHash("sha256").update(PROD_USER).digest("hex");

  const prod = {
    NODE_ENV: "development",
    DATABASE_URL: `postgres://${PROD_USER}:pw@db.prisma.io:5432/postgres`,
  };

  it.each([
    // A hosted development database: same host and database name as
    // production, distinguishable only by its credentials.
    ["a hosted dev database", "postgres://dev-user:pw@db.prisma.io:5432/postgres"],
    ["a local database", "postgresql://postgres:dev@localhost:5433/gitcron_dev"],
    ["a database on 127.0.0.1", "postgresql://postgres:dev@127.0.0.1:5433/gitcron_dev"],
  ])("allows %s", (_label, DATABASE_URL) => {
    expect(() =>
      assertNotProductionDatabase(
        { NODE_ENV: "development", DATABASE_URL },
        PROD_SHA,
      ),
    ).not.toThrow();
  });

  it("blocks the production database", () => {
    expect(() => assertNotProductionDatabase(prod, PROD_SHA)).toThrow(
      /production database/,
    );
  });

  it("explains the consequence and every way out", () => {
    const error = getError(() => assertNotProductionDatabase(prod, PROD_SHA));

    expect(error.message).toContain("production cron");
    expect(error.message).toContain("console.prisma.io");
    expect(error.message).toContain("npm run db:up");
    expect(error.message).toContain("ALLOW_REMOTE_DB");
  });

  // The message must not become a way to leak the credential it recognises.
  it("does not echo the connection string", () => {
    const error = getError(() => assertNotProductionDatabase(prod, PROD_SHA));

    expect(error.message).not.toContain(PROD_USER);
    expect(error.message).not.toContain("pw");
  });

  it.each(["1", "true", "TRUE"])(
    "yields to ALLOW_REMOTE_DB=%s",
    (ALLOW_REMOTE_DB) => {
      expect(() =>
        assertNotProductionDatabase({ ...prod, ALLOW_REMOTE_DB }, PROD_SHA),
      ).not.toThrow();
    },
  );

  it("ignores an ALLOW_REMOTE_DB value that is not an opt-in", () => {
    expect(() =>
      assertNotProductionDatabase({ ...prod, ALLOW_REMOTE_DB: "0" }, PROD_SHA),
    ).toThrow(/production database/);
  });

  // Production is *supposed* to use the production database.
  it("does not apply in production", () => {
    expect(() =>
      assertNotProductionDatabase({ ...prod, NODE_ENV: "production" }, PROD_SHA),
    ).not.toThrow();
  });

  // All three are somebody else's problem to report, not this guard's.
  it("stays quiet when DATABASE_URL is absent", () => {
    expect(() =>
      assertNotProductionDatabase({ NODE_ENV: "development" }, PROD_SHA),
    ).not.toThrow();
  });

  it("stays quiet when DATABASE_URL cannot be parsed", () => {
    expect(() =>
      assertNotProductionDatabase(
        { NODE_ENV: "development", DATABASE_URL: "not-a-url" },
        PROD_SHA,
      ),
    ).not.toThrow();
  });

  it("stays quiet when no fingerprint is configured", () => {
    expect(() => assertNotProductionDatabase(prod, "")).not.toThrow();
  });

  it("recognises the real production fingerprint it ships with", () => {
    expect(PROD_DB_USER_SHA256).toMatch(/^[0-9a-f]{64}$/);
    expect(
      isProductionDatabase(
        `postgres://${PROD_USER}:pw@db.prisma.io:5432/postgres`,
        PROD_DB_USER_SHA256,
      ),
    ).toBe(false);
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
