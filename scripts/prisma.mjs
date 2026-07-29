/**
 * Runs the Prisma CLI against the same environment Next.js sees.
 *
 * The Prisma CLI reads only .env -- there is no reference to .env.local
 * anywhere in `prisma` or `@prisma/*`. So a DATABASE_URL kept in .env.local is
 * invisible to `prisma db push`, which then silently uses whatever .env holds.
 * This wrapper loads .env.local ahead of .env, matching Next's precedence, and
 * refuses to continue if the result is the production database.
 *
 * Checking here rather than only in lib/db.ts matters because the CLI never
 * loads the app: a schema push is worse than a stray row.
 *
 *   node scripts/prisma.mjs db push
 *   node scripts/prisma.mjs --check      # validate the environment and stop
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { config } from "dotenv";
import {
  databaseUser,
  isProductionDatabase,
  isRemoteDbAllowed,
  LOCAL_DB_URL,
} from "../lib/dev-db-guard.mjs";

// First file wins, so .env.local overrides .env exactly as it does in Next.
config({ path: [".env.local", ".env"], quiet: true });

const url = process.env.DATABASE_URL?.trim();
const allowed = isRemoteDbAllowed(process.env.ALLOW_REMOTE_DB);

if (!url && !allowed) {
  console.error(
    "DATABASE_URL is not set in .env.local or .env\n\n" +
      "Set it to your development database, or start one locally:\n\n" +
      `  npm run db:up\n  DATABASE_URL=${LOCAL_DB_URL}\n`,
  );
  process.exit(1);
}

if (!allowed && isProductionDatabase(url)) {
  console.error(
    "Refusing to run a Prisma command against the production database.\n\n" +
      "This would apply a schema to the database the deployed app is using.\n\n" +
      "Use your development database instead -- copy its connection string from\n" +
      "https://console.prisma.io and set DATABASE_URL in .env.local. Or run one\n" +
      `locally:\n\n  npm run db:up\n  DATABASE_URL=${LOCAL_DB_URL}\n\n` +
      "To do this deliberately, set ALLOW_REMOTE_DB=1.\n",
  );
  process.exit(1);
}

if (allowed) {
  console.warn("! ALLOW_REMOTE_DB is set - skipping the production-database check");
} else {
  console.log(`✓ database: ${databaseUser(url)?.slice(0, 8) ?? "local"}… (not production)`);
}

const args = process.argv.slice(2);
if (args[0] === "--check") process.exit(0);

// npm puts node_modules/.bin on PATH, but this file may also be run directly.
const local = path.join(
  process.cwd(),
  "node_modules",
  ".bin",
  process.platform === "win32" ? "prisma.cmd" : "prisma",
);

const { status } = spawnSync(existsSync(local) ? local : "prisma", args, {
  stdio: "inherit",
  env: process.env,
});

process.exit(status ?? 1);
