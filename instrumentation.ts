/**
 * Validates the environment once, when the server starts.
 *
 * Without this the checks are lazy: assertAuthEnv runs when something imports
 * @/auth and assertNotProductionDatabase when something imports @/lib/db, so a
 * misconfigured environment surfaces on whichever request happens to touch it
 * first -- `/` redirects to `/signin` without ever reaching the database.
 */
export async function register() {
  // Also called for the edge runtime, which cannot load node:crypto. Imported
  // dynamically so that module never enters an edge bundle.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { assertAuthEnv, assertNotProductionDatabase } = await import(
    "@/lib/env"
  );

  assertAuthEnv();
  assertNotProductionDatabase();
}
