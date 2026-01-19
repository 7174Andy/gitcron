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
- PostgreSQL database (local or cloud like [Neon](https://neon.tech))
- GitHub OAuth App

### 1. Clone the repository

```bash
git clone https://github.com/7174Andy/gitcron.git
cd gitcron
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set up environment variables

Copy the example environment file:

```bash
cp .env.example .env
```

Fill in the required values:

```env
# NextAuth.js - Generate with: openssl rand -base64 32
AUTH_SECRET=your-auth-secret

# GitHub OAuth App (https://github.com/settings/developers)
GITHUB_CLIENT_ID=your-client-id
GITHUB_CLIENT_SECRET=your-client-secret

# PostgreSQL Database
DATABASE_URL=postgresql://user:password@localhost:5432/gitcron

# Cron Authentication - Generate with: openssl rand -base64 32
CRON_SECRET=your-cron-secret
```

### 4. Create a GitHub OAuth App

1. Go to [GitHub Developer Settings](https://github.com/settings/developers)
2. Click "New OAuth App"
3. Fill in:
   - **Application name:** GitCron
   - **Homepage URL:** `http://localhost:3000`
   - **Authorization callback URL:** `http://localhost:3000/api/auth/callback/github`
4. Copy the Client ID and Client Secret to your `.env` file

### 5. Set up the database

```bash
npx prisma db push
```

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
4. Deploy

### Update GitHub OAuth App

After deployment, update your GitHub OAuth App:
- **Homepage URL:** `https://your-app.vercel.app`
- **Authorization callback URL:** `https://your-app.vercel.app/api/auth/callback/github`

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
