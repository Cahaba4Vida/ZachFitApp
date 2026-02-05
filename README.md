# ZL FitApp (Netlify + Neon) - Deployable Scaffold

This repo is a **ready-to-deploy scaffold** implementing the core product rules you specified:

- Netlify Identity auth (multi-user)
- Growth mode: **Free Flow** vs **Limited Flow** (AI locked for newcomers)
- Manual approvals queue (admin)
- Promo codes (single-use per user) with:
  - optional **growth gate bypass**
  - rolling **duration from redemption**
  - paid annual code flow that **immediately redirects to Stripe annual checkout**
- Settings: per-user **custom AI instructions** (server-enforced **500 char max**)
- Broadcast messaging (admin)
- Admin broadcast bot with **transcripts stored for 30 days** (auto-cleaned daily)
- Legal forms signing: stores receipt in DB and emails a copy to **zach@zachedwardsllc.com** (uses Resend if configured)

> Notes
> - AI model calls are **stubs** in this scaffold. Wire in OpenAI/your provider inside `netlify/functions/api.ts`.
> - Stripe webhooks are not fully implemented here; you need to add webhook handling for real subscriptions.

---

## 1) Quick start (local)

```bash
npm install
cp .env.example .env
# fill DATABASE_URL (Neon)

# Run Netlify Dev (serves frontend + functions)
npm run netlify:dev
```

The app runs at `http://localhost:8888`.

---

## 2) Database setup (Neon)

1. Create a Neon Postgres database.
2. Run the schema:

```sql
-- run in Neon SQL Editor
\i db/schema.sql
```

---

## 3) Netlify Identity

In Netlify Dashboard:
- Enable **Identity**
- Enable registration (you can later control growth via the in-app Limited Flow mode)

This scaffold verifies JWTs via the Identity JWKS endpoint.

---

## 4) Stripe (for annual paid promo codes)

1. Create a Stripe annual subscription price.
2. Put your Stripe secret key in `.env` / Netlify env vars.
3. In the Admin UI (Promo Codes), create a code with:
   - billing_mode = `annual_paid`
   - stripe_price_id_annual = your annual price id

Redeeming the code will redirect immediately to checkout.

---

## 5) Email (Resend)

Optional but recommended for forms signing:
- Set `RESEND_API_KEY`
- Set `MAIL_FROM` and `ADMIN_EMAIL`

If not configured, the app will log a message instead of emailing.

---

## 6) Deploy

1. Push this repo to GitHub.
2. Create a new Netlify site from the repo.
3. Add environment variables (Site settings â Environment variables):
   - DATABASE_URL
   - STRIPE_SECRET_KEY (if using)
   - RESEND_API_KEY (optional)
   - MAIL_FROM / ADMIN_EMAIL
4. Deploy.

---

## Admin bootstrap

New users default to role `user`.
To make your account admin, update your row in `users`:

```sql
update users set role='super_admin' where email='zach@zachedwardsllc.com';
```

---

## Where to implement AI

Inside `netlify/functions/api.ts`:
- `/api/chat/adjust` (daily workout chatbot)
- `/api/onboarding/program/generate` (program builder)
- `/api/admin/assistant/...` (broadcast bot)

Ensure:
- no medical advice
- conservative volume/intensity caps
- no fat-loss goal suggestions

---

## Scheduled cleanup

`netlify/functions/admin-assistant-cleanup.ts` runs daily to delete admin assistant threads where `expires_at < now()`.



## Launch checklist (today)

1) Create Neon DB and run `db/schema.sql`
2) Netlify: enable Identity, set env vars:
   - DATABASE_URL
   - APP_URL
   - ADMIN_EMAIL
   - OPENAI_API_KEY (and optional OPENAI_MODEL)
   - STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET (if taking payments today)
3) Stripe: set a webhook endpoint to:
   - `https://<your-site>/api/stripe/webhook`
   (Netlify routes `/api/*` to the api function.)
4) First login, promote admin:
   ```sql
   update users set role='super_admin' where email='zach@zachedwardsllc.com';
   ```
5) Create promo codes in Admin > Promo Codes.

Notes:
- Program generation and daily adjust use the OpenAI Responses API when OPENAI_API_KEY is set.
- Coach bot responses are enforced to one sentence server-side.
