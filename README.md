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
cp .env.example .env
```

Use `.env`, not `.env.local`. Next.js reads both, but **the Prisma CLI reads only
`.env`** — a `DATABASE_URL` in `.env.local` is invisible to `prisma db push`,
which would silently use whatever `.env` says instead. Keeping one file removes
the chance of the app and the CLI disagreeing about which database they mean.
Both are gitignored; production values belong in the Vercel dashboard.

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
schema, either way:

```bash
npm run db:push
```

| Script | Effect |
|---|---|
| `npm run db:up` | Start the local database, waiting until it accepts connections |
| `npm run db:down` | Stop it, keeping the data |
| `npm run db:push` | Apply `prisma/schema.prisma` to whatever `DATABASE_URL` names |
| `npm run db:reset` | Destroy the local data and re-apply the schema |

### 6. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### 7. Test the cron endpoint (local development)

The cron job doesn't run automatically in development. Test it manually:

```bash
curl -H "Authorization: Bearer YOUR_CRON_SECRET" http://localhost:3000/api/cron/execute
```

Or run a loop to simulate production:

```bash
while true; do
  curl -s -H "Authorization: Bearer YOUR_CRON_SECRET" http://localhost:3000/api/cron/execute
  sleep 60
done
```

## Development safeguards

Two checks run outside production, both in `lib/env.ts`, called from
`instrumentation.ts` when the server starts.

**Auth configuration.** `AUTH_SECRET`, `GITHUB_CLIENT_ID`, and
`GITHUB_CLIENT_SECRET` must be present and non-blank. Blank counts as missing on
purpose: `cp .env.example .env` leaves every key present but empty, and
`@auth/core` fills provider credentials with `??=`, so `""` is not nullish, never
falls back to `AUTH_GITHUB_ID`, and reaches GitHub as an empty `client_id`.

**Production database.** Every Prisma Postgres database is reached at
`db.prisma.io:5432/postgres`, so development and production differ only in their
credentials and no hostname check can tell them apart. Instead
`lib/dev-db-guard.mjs` holds a SHA-256 of the production database's username and
the server refuses to start if `DATABASE_URL` matches it. The hash of a
64-character opaque identifier is not reversible, so it is safe to commit — and
it means no production credential has to live on a development machine.

The same check runs before `db:push` and `db:reset` via
`scripts/check-dev-db.mjs`, because the Prisma CLI never loads the app and a
schema push is worse than a stray row.

To use the production database deliberately — reading a real row while debugging,
say — set `ALLOW_REMOTE_DB=1`.

> Rotating the production database's credentials invalidates the fingerprint,
> and the guard then stops recognising production. Recompute it with the command
> in the comment above `PROD_DB_USER_SHA256`.

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
