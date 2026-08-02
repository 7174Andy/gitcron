/**
 * Imitates the production cron against a local dev server.
 *
 * Nothing calls /api/cron/execute locally: production points cron-job.org at
 * the deployed URL and vercel.json declares no crons, so on localhost a due
 * schedule stays "pending" forever -- scheduledAt is a WHERE filter in
 * getDueScheduleIds, not a timer. This calls the endpoint on the same cadence
 * production uses.
 *
 * This dispatches REAL workflow runs against real repositories. It is the
 * production dispatcher, not a simulation of it.
 *
 *   npm run cron:dev   # ticks immediately, then every 60s until Ctrl-C
 *
 * Override with CRON_DEV_URL and CRON_DEV_INTERVAL_MS.
 */
import { config } from "dotenv";

// First file wins, so .env.local overrides .env exactly as it does in Next --
// which matters here because the two files may hold different CRON_SECRETs,
// and the app reads .env.local.
config({ path: [".env.local", ".env"], quiet: true });

const secret = process.env.CRON_SECRET?.trim();
const url =
  process.env.CRON_DEV_URL ?? "http://localhost:3000/api/cron/execute";
const intervalMs = Number(process.env.CRON_DEV_INTERVAL_MS ?? 60_000);

if (!secret) {
  console.error(
    "CRON_SECRET is not set in .env.local or .env\n\n" +
      "The endpoint authenticates with it, so without it every call is a 401.\n" +
      "Generate one with: openssl rand -base64 32\n",
  );
  process.exit(1);
}

async function tick() {
  const at = new Date().toISOString().slice(11, 19);

  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${secret}` },
    });
    const body = await response.json().catch(() => null);

    if (!response.ok) {
      const hint =
        response.status === 401
          ? "  (CRON_SECRET here does not match the one the server loaded)"
          : "";
      console.error(
        `${at}  HTTP ${response.status}  ${body?.error ?? response.statusText}${hint}`,
      );
      return;
    }

    const { processed = 0, triggered = 0, failed = 0, resolution } = body ?? {};
    console.log(
      `${at}  processed ${processed}  triggered ${triggered}  failed ${failed}` +
        `  linked ${resolution?.linked ?? 0}  resolved ${resolution?.resolved ?? 0}`,
    );
  } catch (error) {
    // Dev server down or mid-restart. Not fatal - the next tick retries.
    console.error(`${at}  unreachable: ${error.message}`);
  }
}

console.warn("! dispatches real workflow runs against real repositories");
console.log(`↻ ${url} every ${intervalMs / 1000}s - Ctrl-C to stop\n`);

// Sequential rather than setInterval so a slow tick can never overlap itself.
// Ticks before the first sleep, so Ctrl-C after one line is a single tick.
while (true) {
  await tick();
  await new Promise((resolve) => setTimeout(resolve, intervalMs));
}
