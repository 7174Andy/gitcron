/**
 * Applies pending migrations during a production build.
 *
 * This exists because nothing used to apply schema changes to production at
 * all. `prisma generate` builds a client that assumes the schema; it never
 * touches the database. So a merged schema change deployed a client whose
 * queries referenced columns the production database did not have, and the
 * failure only surfaced at runtime -- see the `Schedule.runUrl` /
 * `Schedule.runConclusion` outage: creating and listing schedules broke, and
 * the run-resolution pass errored on every cron tick for days.
 *
 * Gated on VERCEL_ENV rather than running everywhere, because a preview build
 * pointed at the production database would apply that branch's migrations to
 * production before the branch is merged. If preview deployments have their
 * own database, drop the gate so previews migrate too.
 *
 * A missing DATABASE_URL is a hard failure, not a skip. Skipping would restore
 * exactly the silence this script exists to remove, and a failed build is the
 * safe direction: Vercel keeps serving the previous deployment.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const vercelEnv = process.env.VERCEL_ENV;

// Local builds (`npm run build`) have no VERCEL_ENV. Migrating a developer's
// database as a side effect of a build would be a surprise, so require Vercel.
if (!vercelEnv) {
  console.log("• not a Vercel build - skipping `prisma migrate deploy`");
  process.exit(0);
}

if (vercelEnv !== "production") {
  console.log(`• VERCEL_ENV is "${vercelEnv}" - skipping \`prisma migrate deploy\``);
  process.exit(0);
}

if (!process.env.DATABASE_URL?.trim()) {
  console.error(
    "DATABASE_URL is not available to this production build, so pending\n" +
      "migrations cannot be applied.\n\n" +
      "Failing the build on purpose: deploying a Prisma Client whose schema\n" +
      "the database does not have produces runtime errors on every query that\n" +
      "touches a new column, and Vercel will keep serving the previous\n" +
      "deployment until this is fixed.\n\n" +
      "Expose DATABASE_URL to the Build step for the Production environment in\n" +
      "the Vercel project's Environment Variables settings.\n",
  );
  process.exit(1);
}

// npm puts node_modules/.bin on PATH, but this file may also be run directly.
const local = path.join(
  process.cwd(),
  "node_modules",
  ".bin",
  process.platform === "win32" ? "prisma.cmd" : "prisma",
);

const { status } = spawnSync(
  existsSync(local) ? local : "prisma",
  ["migrate", "deploy"],
  { stdio: "inherit", env: process.env },
);

process.exit(status ?? 1);
