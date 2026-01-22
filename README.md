# ZachFitApp

Lightweight coaching web app for building programs, logging workouts, and tracking PRs.

## Features
- Netlify Identity auth (instant signup/login).
- Plan builder → 4-week program generator.
- Program refinement and today-adjust AI flows (via Netlify Function proxy).
- Workout calendar + logging per set.
- PR history and progress chart.
- Admin dashboard with client detail + coach prompt link.
- PWA support (manifest + service worker) and add-to-home-screen guidance.

## Environment Variables
Set these in Netlify (or locally when running Netlify dev):

- `OPENAI_API_KEY` (required)
- `OPENAI_MODEL` (optional, default `gpt-4o-mini`)
- `ADMIN_EMAIL_ALLOWLIST` (optional, default `edwardszachary647@gmail.com`)
- `DATABASE_URL` (required for Postgres persistence)
- `PGSSLMODE` (optional, set to `require` if not included in `DATABASE_URL`)

## OpenAI Model Notes
Some OpenAI models (e.g. `gpt-5`) restrict sampling parameters and only allow the default temperature. The AI function omits the `temperature` field entirely for compatibility, so model selection should not fail with unsupported sampling settings.

## Local Development

1. Install dependencies:
   ```bash
   npm install
   ```
2. Run Netlify dev:
   ```bash
   npx netlify dev
   ```
3. Open the app at `http://localhost:8888`.
4. Run the smoke test (requires a Netlify Identity JWT in `AUTH_TOKEN`):
   ```bash
   node scripts/smoke.mjs
   ```

## Deploy to Netlify

1. Connect the repo in Netlify.
2. Set the environment variables listed above.
3. Build settings:
   - Publish directory: `.`
   - Functions directory: `netlify/functions`
4. Deploy.

## Database Migrations (Neon)
Run the SQL in `migrations/001_init.sql` via the Neon SQL Editor before first deploy. This creates the tables used for onboarding/program persistence along with shared key-value storage.

## API Overview
All API routes are available under `/api/*` and map to Netlify functions.

- Auth/profile: `/api/whoami`, `/api/profile-get`, `/api/profile-save`
- Program: `/api/program-generate`, `/api/program-get`, `/api/program-save`, `/api/program-finalize`, `/api/program-revisions`, `/api/program-undo`
- Workouts: `/api/workouts-get`, `/api/workout-get?date=`, `/api/workout-save?date=`, `/api/workout-log-save?date=`
- PRs: `/api/pr-add`, `/api/pr-list`, `/api/pr-stats`
- Audit: `/api/audit-log-event`, `/api/admin/audit-list`
- Admin: `/api/admin/clients-list`, `/api/admin/client-get`, `/api/admin/client-update`
- AI: `/api/ai` (modes: `program_refine`, `today_adjust`)

## Test Checklist
- Sign up and log in with Netlify Identity.
- Generate a program with onboarding inputs.
- Save onboarding and refresh program.
- Finalize program (audit log event recorded).
- Open Workouts and log sets.
- Add PR and verify progress chart.
- Switch units (lb/kg) in Settings.
- Admin login (allowlisted email) sees client list and coach prompt.

## Manual QA Steps
1. **Auth**: Sign up and log in; confirm user chip updates.
2. **Plan Builder**: Generate a program and verify week tabs + day cards render.
3. **Program Chat**: Send a refinement message; ensure AI response appears.
4. **Workouts**: Open today’s workout, log sets, save; refresh and confirm logs persist.
5. **PRs**: Add multiple PRs and confirm history + chart update.
6. **Settings**: Toggle units and confirm save.
7. **Admin**: Use allowlisted email to open Admin page; verify client detail + coach prompt link.


## Deterministic installs (package-lock)

This repo intentionally pins dependency versions in `package.json`. To generate a `package-lock.json` on your machine, run:

- `npm install` (or `npm i`) in the repo root

Netlify will then use the lockfile for deterministic installs.
