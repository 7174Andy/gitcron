# GitCron

Schedule GitHub Actions workflows to run at specific times. GitCron provides a simple web interface to trigger your workflows on a schedule without modifying your repository's workflow files.

## Key Features

- **One-time Scheduling** - Schedule workflows to run at a specific date and time
- **Timezone Support** - Select your local timezone with automatic UTC conversion
- **Repository Browser** - Browse all your GitHub repositories and workflows
- **Execution History** - Track scheduled, triggered, and failed workflow runs
- **Secure Authentication** - GitHub OAuth with minimal required permissions

## Tech Stack

- **Framework:** Next.js 16 with App Router
- **Database:** PostgreSQL with Prisma ORM
- **Authentication:** NextAuth.js with GitHub OAuth
- **Styling:** Tailwind CSS
- **Deployment:** Vercel
- **Cron:** cron-job.org (external scheduler)

## Getting Started

### Prerequisites

- Node.js 18+
- A GitHub account (you'll register your own OAuth App in step 3)
- A development database — either one from [Prisma](https://console.prisma.io)
  or Docker, to run Postgres locally (step 5)

### 1. Clone the repository

```bash
git clone https://github.com/7174Andy/gitcron.git
cd gitcron
```

### 2. Install dependencies

```bash
npm install
```

### 3. Local development authentication

A GitHub OAuth App allows exactly **one** authorization callback URL, so the
deployed site's credentials cannot also serve `localhost`. Register your own app
for development:

1. Go to [GitHub Developer Settings](https://github.com/settings/developers)
2. Click **New OAuth App**
3. Fill in:
   - **Application name:** GitCron (dev)
   - **Homepage URL:** `http://localhost:3000`
   - **Authorization callback URL:** `http://localhost:3000/api/auth/callback/github`
4. Click **Register application**, then **Generate a new client secret**

Keep this app separate from the one the deployed site uses — see
[Deployment](#deployment). The dev app is yours alone; its credentials never
need to be shared.

> **Don't set `AUTH_URL` locally.** Auth.js infers the origin from the incoming
> request and already trusts the host whenever `NODE_ENV` isn't `production`.
> Setting it rewrites the request origin, so a value copied from production
> silently breaks localhost sign-in.

### 4. Set up environment variables

```bash
cp .env.example .env.local
```

Keep local development in `.env.local` and leave `.env` out of it. Both are
gitignored; production values belong in the Vercel dashboard, not on a
development machine.

> **Use the `db:*` scripts for Prisma.** The Prisma CLI reads only `.env` and has
> no knowledge of `.env.local`, so `npx prisma migrate dev` typed by hand would
> use whatever `.env` holds. Every `db:*` script goes through
> `scripts/prisma.mjs`, which loads `.env.local` first — matching Next's
> precedence — and refuses to touch the production database. Keeping no
> production `DATABASE_URL` in `.env` removes the last thing a stray command
> could find.

```env
# GitHub OAuth App from step 3
GITHUB_CLIENT_ID=your-client-id
GITHUB_CLIENT_SECRET=your-client-secret

# Auth.js - Generate with: openssl rand -base64 32
AUTH_SECRET=your-auth-secret

# Development database - see step 5
DATABASE_URL=

# Cron Authentication - Generate with: openssl rand -base64 32
CRON_SECRET=your-cron-secret

# Token encryption (32 bytes, base64 encoded)
# Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
ENCRYPTION_KEY=your-encryption-key
```

`AUTH_SECRET`, `GITHUB_CLIENT_ID`, and `GITHUB_CLIENT_SECRET` are validated when
the server starts. A missing or blank value fails immediately with setup
instructions rather than surfacing as an opaque error partway through sign-in.

### 5. Set up the database

**Never point `DATABASE_URL` at production.** A schedule is a row, and the
deployed cron executes every due row it finds — so a schedule created while
testing locally dispatches a real workflow against a real repository, and
nothing on your machine shows that it happened. The server refuses to start if
it recognises the production database (see
[Development safeguards](#development-safeguards)).

Pick either option.

**Option A — a Prisma development database.** Create one at
[console.prisma.io](https://console.prisma.io) and copy its connection string
into `DATABASE_URL`:

```env
DATABASE_URL=postgres://<user>:<password>@db.prisma.io:5432/postgres?sslmode=require
```

**Option B — Postgres locally via Docker.** No account needed and it works
offline:

```bash
npm run db:up
```

```env
DATABASE_URL=postgresql://postgres:dev@localhost:5433/gitcron_dev
```

Port 5433 avoids colliding with a Homebrew Postgres on 5432. Then apply the
migrations, either way:

```bash
npm run db:deploy
```

| Script | Effect |
|---|---|
| `npm run db:up` | Start the local database, waiting until it accepts connections |
| `npm run db:down` | Stop it, keeping the data |
| `npm run db:deploy` | Apply existing migrations to whatever `DATABASE_URL` names |
| `npm run db:migrate` | Create a migration for a `schema.prisma` edit, and apply it |
| `npm run db:status` | Show which migrations the database has |
| `npm run db:push` | Apply the schema *without* writing a migration — scratch use only |
| `npm run db:reset` | Destroy the local data and re-apply the migrations |
| `npm run db:studio` | Browse the rows in Prisma Studio |

### Changing the schema

`prisma/migrations/` is the source of truth, not `schema.prisma` alone. Edit the
schema, then:

```bash
npm run db:migrate
```

Commit the generated `prisma/migrations/` directory with the schema change. The
production build applies it (see [Deploying schema
changes](#deploying-schema-changes)).

> Do not use `npm run db:push` for a change you intend to commit. It alters the
> database to match the schema without recording a migration, so the deployed
> build has nothing to apply and production silently keeps the old columns —
> which is exactly how `Schedule.runUrl` and `Schedule.runConclusion` reached
> production missing, breaking schedule creation and listing outright and
> erroring the run-resolution pass on every cron tick.

### 6. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), sign in, and then **open the
repository dropdown**. That is the check that matters: signing in only proves the
callback worked, while a populated repository list proves the access token and
its `repo` and `workflow` scopes survived into the session — every GitHub call in
`lib/actions/github.ts` reads `session.accessToken`. A successful sign-in with an
empty dropdown means the session exists but the token is unusable.

### 7. Test the cron endpoint

Nothing schedules the cron locally, so trigger it yourself. This reads
`CRON_SECRET` from `.env.local` rather than making you paste it:

```bash
SECRET=$(node -e 'require("dotenv").config({path:".env.local",quiet:true});process.stdout.write(process.env.CRON_SECRET)')
curl -s -H "Authorization: Bearer $SECRET" http://localhost:3000/api/cron/execute
```

With nothing due you get `{"message":"No schedules due",...}`. To exercise the
whole path, add a workflow to a repository you don't mind dispatching:

```yaml
# .github/workflows/gitcron-test.yml
name: GitCron Test
on: workflow_dispatch
jobs:
  noop:
    runs-on: ubuntu-latest
    steps:
      - run: echo "dispatched at $(date -u)"
```

Schedule it a couple of minutes out, then call the endpoint again — `triggered`
becomes 1. Call it once more a minute later and the resolution pass fills in
`runId`, `runUrl`, and `runConclusion`. `npm run db:studio` shows the rows.

Or run a loop to imitate production:

```bash
while true; do
  curl -s -H "Authorization: Bearer $SECRET" http://localhost:3000/api/cron/execute
  sleep 60
done
```

## Checks

```bash
npm test          # Vitest, unit tests
npm run lint      # ESLint
npx tsc --noEmit  # Type check
npm run build     # Production build
```

Tests live in `__tests__` directories beside the code they cover and mock
`@/lib/db`, `@/auth`, and `@/lib/crypto`, so none of them need a database or
network. A local `npm run build` runs `prisma generate`, which does not connect
to anything, and skips the migration step — that step requires `VERCEL_ENV`, so
building locally never migrates the database you happen to be pointed at.

### Deploying schema changes

`npm run build` runs `scripts/migrate-deploy.mjs` between `prisma generate` and
`next build`. On a production Vercel build it runs `prisma migrate deploy`;
everywhere else it prints why it is skipping.

Preview builds skip it deliberately: a preview pointed at the production
database would apply an unmerged branch's migrations to production. If preview
deployments get their own database, drop that gate so previews migrate too.

A production build with no `DATABASE_URL` fails rather than skipping. Skipping
would restore the silence this script exists to remove, and failing is the safe
direction — Vercel keeps serving the previous deployment.

## Development safeguards

Two checks run outside production, both in `lib/env.ts`, called from
`instrumentation.ts` when the server starts.

**Auth configuration.** `AUTH_SECRET`, `GITHUB_CLIENT_ID`, and
`GITHUB_CLIENT_SECRET` must be present and non-blank. Blank counts as missing on
purpose: `cp .env.example .env.local` leaves every key present but empty, and
`@auth/core` fills provider credentials with `??=`, so `""` is not nullish, never
falls back to `AUTH_GITHUB_ID`, and reaches GitHub as an empty `client_id`.

**Production database.** Every Prisma Postgres database is reached at
`db.prisma.io:5432/postgres`, so development and production differ only in their
credentials and no hostname check can tell them apart. Instead
`lib/dev-db-guard.mjs` holds a SHA-256 of the production database's username and
the server refuses to start if `DATABASE_URL` matches it. The hash of a
64-character opaque identifier is not reversible, so it is safe to commit — and
it means no production credential has to live on a development machine.

The same check runs in `scripts/prisma.mjs`, which every `db:*` script goes
through, because the Prisma CLI never loads the app and a schema push is worse
than a stray row. That wrapper also loads `.env.local` ahead of `.env` so the CLI
and the app agree on which database they mean — the CLI alone reads only `.env`.

To use the production database deliberately — reading a real row while debugging,
say — set `ALLOW_REMOTE_DB=1`.

> Rotating the production database's credentials invalidates the fingerprint,
> and the guard then stops recognising production. Recompute it with the command
> in the comment above `PROD_DB_USER_SHA256`.

## Troubleshooting

**`DATABASE_URL is the production database` on startup.** The guard working as
intended. Usually the cause is not a wrong value but a *missing* one:
`.env.local` overrides `.env` **per key**, so a `DATABASE_URL` absent from
`.env.local` silently falls through to whatever `.env` holds. Set it explicitly,
and keep no production `DATABASE_URL` in `.env`.

**Sign-in fails with a redirect URI mismatch.** The OAuth App whose
`GITHUB_CLIENT_ID` you are using does not have
`http://localhost:3000/api/auth/callback/github` as its callback. One app cannot
hold two callback URLs — register a separate dev app (step 3). Check which
client ID is actually being sent:

```bash
curl -s -c /tmp/cj http://localhost:3000/api/auth/csrf >/dev/null
CSRF=$(curl -s -b /tmp/cj http://localhost:3000/api/auth/csrf | sed -E 's/.*"csrfToken":"([^"]*)".*/\1/')
curl -s -b /tmp/cj -o /dev/null -D - -X POST http://localhost:3000/api/auth/signin/github \
  --data-urlencode "csrfToken=$CSRF" | grep -io "client_id=[^&]*\|redirect_uri=[^&]*"
```

**Sign-in redirects somewhere unexpected.** Check for an `AUTH_URL` left in
either env file. `next-auth` rewrites the request origin to it, so a value copied
from production sends the callback to the deployed site.

**`Missing or empty auth environment variables`.** Blank counts as missing.
`cp .env.example .env.local` leaves every key present but empty.

**`docker compose` fails with `unexpected character "\"" in variable name`.**
Compose reads an env file in its project directory and its parser is stricter
than dotenv's — an unbalanced quote breaks it. Prefer unquoted values; dotenv
does not need quotes and a stray one ends up *inside* the value. The `db:*`
scripts point Compose at `docker/`, so a root `.env` no longer affects them.

**A Prisma command used a database you didn't expect.** The Prisma CLI reads only
`.env`. Use the `db:*` scripts, which load `.env.local` first.

**`The column Schedule.<name> does not exist in the current database`.** The
running Prisma Client expects a column the database lacks: a schema change
reached that environment without its migration. Check with `npm run db:status`,
and apply with `npm run db:deploy`. If the migration was never written — the
schema was changed with `db:push` — recreate it with `npm run db:migrate` and
commit `prisma/migrations/`.

**Port 5433 already in use.** Something else holds it — `npm run db:down`, or
change the host side of the port mapping in `docker/docker-compose.yml`.

## Deployment

### Deploy to Vercel

1. Push your code to GitHub
2. Import the project in [Vercel](https://vercel.com)
3. Add environment variables in Vercel dashboard:
   - `AUTH_SECRET`
   - `GITHUB_CLIENT_ID`
   - `GITHUB_CLIENT_SECRET`
   - `DATABASE_URL`
   - `CRON_SECRET`
   - `ENCRYPTION_KEY`
4. Deploy

`DATABASE_URL` must be exposed to the **Build** step, not only the runtime — the
production build runs `prisma migrate deploy` and fails without it. See
[Deploying schema changes](#deploying-schema-changes).

### Create a production GitHub OAuth App

Register a **second** OAuth App for the deployed site rather than repointing your
dev app — one app cannot hold both callback URLs, and editing it would break
local sign-in for everyone using it:

- **Application name:** GitCron
- **Homepage URL:** `https://your-app.vercel.app`
- **Authorization callback URL:** `https://your-app.vercel.app/api/auth/callback/github`

Use this app's Client ID and Client Secret for the Vercel environment variables
above. Your `.env.local` keeps the dev app's credentials.

### Set up cron-job.org

1. Sign up at [cron-job.org](https://cron-job.org) (free)
2. Create a new cron job:
   - **URL:** `https://your-app.vercel.app/api/cron/execute`
   - **Schedule:** Every 1 minute
   - **Headers:** `Authorization: Bearer YOUR_CRON_SECRET`
3. Enable the cron job

## Usage

1. **Sign in** with your GitHub account
2. **Click "Schedule a workflow"** to create a new schedule
3. **Select a repository** from your GitHub account
4. **Choose a workflow** file from the repository
5. **Set the date and time** when you want the workflow to run
6. **Select your timezone** (auto-detected by default)
7. **Click "Schedule"** to save

The workflow will be triggered automatically at the scheduled time.

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/*` | * | NextAuth.js authentication |
| `/api/cron/execute` | GET | Trigger due scheduled workflows (requires `CRON_SECRET`) |

## License

MIT
