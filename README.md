# Fit Hub Leader Dashboard

Fit Hub is a leader dashboard for tracking weekly execution across three teams. It now connects **directly to Postgres** from the browser, so it only needs a database to run.

## Requirements

- Node.js 18+
- Neon Postgres database

## Environment Variables

You’ll enter your database connection string in the login screen and it will be saved to
localStorage in the browser. **This exposes your DB credentials to anyone with access to the
browser**, so only use this in trusted environments.

## Run Locally

```bash
npm install
npm run dev
```

Visit the local server URL and enter your database URL.

## Neon Setup

1. Create a Neon project and database.
2. Copy the connection string and paste it into the login screen.
3. Make sure the connection string uses SSL (Neon requires SSL).

## Database Migration

Run the migration once after setting up your database:

```bash
psql "$DATABASE_URL" -f migrations/001_init.sql
```

The migration SQL lives in `migrations/001_init.sql` and is idempotent.

## Local Dev Notes

- The app now talks directly to the database, so there is no API layer.

## Export & Analyze Workflow

1. Click **Export Team History** or **Export All Teams History**.
2. The app copies JSON to your clipboard.
3. A new ChatGPT tab opens.
4. Paste the JSON into ChatGPT to analyze weekly trends.

## Token Rotation Process

1. Rotate your database password in Neon.
2. Notify all leaders to update their stored URL (Settings → Clear Database URL → re-enter).
