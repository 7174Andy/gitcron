/**
 * Refuses to let a Prisma command touch the production database.
 *
 * The runtime guard in lib/db.ts cannot help here: `prisma db push` never loads
 * the app. A schema push against production is worse than a stray row, and
 * `db:reset` starts by destroying a volume, so the documented path checks first.
 *
 * Reads .env deliberately, because that is the only env file the Prisma CLI
 * itself reads -- it has no knowledge of .env.local.
 */
import { config } from "dotenv";
import {
  databaseUser,
  isProductionDatabase,
  isRemoteDbAllowed,
  LOCAL_DB_URL,
} from "../lib/dev-db-guard.mjs";

config({ quiet: true });

const url = process.env.DATABASE_URL?.trim();

if (isRemoteDbAllowed(process.env.ALLOW_REMOTE_DB)) {
  console.warn("! ALLOW_REMOTE_DB is set - skipping the production-database check");
  process.exit(0);
}

if (!url) {
  console.error(
    "DATABASE_URL is not set in .env\n\n" +
      "Set it to your Prisma development database, or start a local one:\n\n" +
      `  npm run db:up\n  DATABASE_URL=${LOCAL_DB_URL}\n`,
  );
  process.exit(1);
}

if (isProductionDatabase(url)) {
  console.error(
    "Refusing to run a Prisma command against the production database.\n\n" +
      "This would apply a schema to the database the deployed app is using.\n\n" +
      "Use your development database instead -- copy its connection string from\n" +
      "https://console.prisma.io and set DATABASE_URL in .env. Or run one locally:\n\n" +
      `  npm run db:up\n  DATABASE_URL=${LOCAL_DB_URL}\n\n` +
      "To do this deliberately, set ALLOW_REMOTE_DB=1.\n",
  );
  process.exit(1);
}

console.log(`✓ database: ${databaseUser(url)?.slice(0, 8)}… (not production)`);
