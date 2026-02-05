
function isDbAvailable(): boolean {
  return !!(process.env.DATABASE_URL && process.env.DATABASE_URL.length > 0);
}

function isWriteEndpoint(path: string, method: string): boolean {
  const m = (method || 'GET').toUpperCase();
  if (m !== 'POST' && m !== 'PUT' && m !== 'PATCH' && m !== 'DELETE') return false;

  // Allow a few safe writes even without DB? (none in this app)
  const allowWithoutDb = new Set<string>([
    '/api/ping'
  ]);
  return !allowWithoutDb.has(path);
}

function dbUnavailable(path: string) {
  return json(503, { error: 'db_unavailable', path });
}

function serverError(path: string, err: any) {
  const msg = err?.message ? String(err.message) : 'unknown_error';
  return json(500, { error: 'server_error', message: msg, path });
}

import type { Handler } from '@netlify/functions';
import { z } from 'zod';
import Stripe from 'stripe';
import { Resend } from 'resend';
import { json, badRequest, forbidden, notFound } from './_shared/http';
import { requireAuth, requireRole } from './_shared/auth';
import { many, one, sql } from './_shared/db_helpers';
import { getSystemSettings, isGrandfathered } from './_shared/gates';
import { ensureBaseRows, getEntitlements, applyEntitlements, hasActivePromoBypass } from './_shared/entitlements';
import { callResponsesAPI, extractJsonBlock, oneSentence } from './_shared/ai';
import { normalizeModel } from './_shared/ai_model';
import { handleToday } from './_routes/today';
import { handleWorkoutLog } from './_routes/workout_log';
import { handleOnboardingGenerate } from './_routes/onboarding_generate';

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' } as any) : null;
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

function getPath(event: any): string {
  const original = event.headers?.['x-nf-original-path'] || event.headers?.['x-original-path'];
  if (original) return original;
  // Netlify dev typically passes /api/... as event.path
  if (event.path && event.path.startsWith('/api/')) return event.path;
  // fallback: try rawUrl query
  const url = event.rawUrl || '';
  const m = url.match(/\/api\/[\w\W]*$/);
  if (m) return m[0];
  return event.path || '/';
}

async function upsertUser(auth: { sub: string; email: string }) {
  await sql(
    `insert into users(id,email,role) values ($1,$2,'user')
     on conflict (id) do update set email = excluded.email`,
    [auth.sub, auth.email]
  );
  // Stamp first_seen_at the first time the user hits /api/me or any authed endpoint.
  await sql(
    `update users set first_seen_at = coalesce(first_seen_at, now()) where id=$1`,
    [auth.sub]
  );
  await ensureBaseRows(auth.sub);
  return await one<any>(
    'select id,email,role,created_at,first_seen_at,preferred_language,units,intensity_style,auto_adjust_mode,analytics_horizon,ai_user_instructions,ai_approved_at from users where id=$1',
    [auth.sub]
  );
}

async function getFormsGate(userId: string, firstSeenAt: string | null) {
  // Liability forms become required after 7 days of actual use (first_seen_at).
  const start = firstSeenAt ? new Date(firstSeenAt).getTime() : Date.now();
  const dueAt = new Date(start + 7 * 86400000);
  const forms = await one<any>('select count(*)::int as c from form_signatures where user_id=$1', [userId]);
  const signed = (forms?.c ?? 0) > 0;
  const required = Date.now() >= dueAt.getTime() && !signed;
  return { signed, required, due_at: dueAt.toISOString() };
}

async function resolveAiStatus(userRow: any) {
  const settings = await getSystemSettings();
  const ent = await getEntitlements(userRow.id);
  const bypass = await hasActivePromoBypass(userRow.id);

  if (settings.growth_mode === 'free_flow') return 'approved';
  const grandfathered = await isGrandfathered(userRow.created_at, settings.ai_gate_start_at);
  if (grandfathered) return 'grandfathered';
  if (userRow.ai_approved_at) return 'approved';
  if (bypass) return 'promo_bypass';
  return 'pending';
}

async function canUseAi(userRow: any): Promise<boolean> {
  const ent = await getEntitlements(userRow.id);
  if (!ent.can_use_ai) return false;
  const status = await resolveAiStatus(userRow);
  return status !== 'pending';
}

function requireAdmin(userRole: string) {
  if (!requireRole('admin', userRole)) throw new Error('forbidden');
}

export const handler: Handler = async (event, context) => {
  
  const authHeader = getHeader(event.headers, 'authorization');
  if (event.httpMethod === 'OPTIONS') return json(200, { ok: true });

  const path = getPath(event);
  const auth = await requireAuth(authHeader, (context as any)?.clientContext?.user, (event.headers || {}) as any);

  const rawBody = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : (event.body || '');

  try {
    // Public ping
    if (path === '/api/ping') return json(200, { ok: true });

    // ===== Auth-required routes =====
    if (path === '/api/me') {
  if (!auth) return forbidden('Login required');

  const safe = async <T>(fn: () => Promise<T>, fallback: T): Promise<T> => {
    try {
      return await fn();
    } catch {
      return fallback;
    }
  };

  // Always try to upsert the user; if this fails, the rest of the app can't function anyway.
  let userRow: any = null;
try {
  // Always try to upsert the user; if DB is unavailable (e.g., deploy preview without env vars),
  // fall back to an identity-only response so the UI can proceed to onboarding.
  userRow = await upsertUser(auth);
} catch (e) {
  return json(200, {
    user: { id: auth.sub, email: auth.email, role: 'user', created_at: null },
    settings: {
      language: 'en',
      units: 'imperial',
      intensity_style: 'calm',
      auto_adjust_mode: 'off',
      analytics_horizon: 28,
      ai_user_instructions: ''
    },
    onboarding: {
      program_created: false,
      forms_signed_all: true,
      forms_due_at: null,
      forms_required_now: false,
      is_unlocked: true
    },
    entitlements: {
      can_use_ai: false,
      can_generate_program: false,
      can_adjust_future: false,
      free_cycles_remaining: 0
    },
    growth_mode: false,
    ai_status: { enabled: false, reason: 'db_unavailable' },
    db_unavailable: true
  });
}


  const ent = await safe(
    () => getEntitlements(userRow.id),
    {
      can_use_ai: false,
      can_generate_program: false,
      can_adjust_future: false,
      free_cycles_remaining: 0
    } as any
  );

  const system = await safe(() => getSystemSettings(), { growth_mode: false } as any);

  const program = await safe(
    () => one<any>("select id from programs where user_id=$1 and status='active' limit 1", [userRow.id]),
    null as any
  );

  const formsGate = await safe(
    () => getFormsGate(userRow.id, userRow.first_seen_at),
    { signed: true, due_at: null, required: false } as any
  );

  const unlocked = await safe(
    () => one<any>('select is_unlocked from onboarding where user_id=$1', [userRow.id]),
    { is_unlocked: true } as any
  );

  const ai_status = await safe(() => resolveAiStatus(userRow), { enabled: false, reason: 'unavailable' } as any);

  return json(200, {
    user: { id: userRow.id, email: userRow.email, role: userRow.role, created_at: userRow.created_at },
    settings: {
      language: userRow.preferred_language,
      units: userRow.units,
      intensity_style: userRow.intensity_style,
      auto_adjust_mode: userRow.auto_adjust_mode,
      analytics_horizon: userRow.analytics_horizon,
      ai_user_instructions: userRow.ai_user_instructions
    },
    onboarding: {
      program_created: !!program,
      forms_signed_all: !!formsGate?.signed,
      forms_due_at: formsGate?.due_at ?? null,
      forms_required_now: !!formsGate?.required,
      is_unlocked: !!unlocked?.is_unlocked
    },
    entitlements: {
      can_use_ai: !!ent.can_use_ai,
      can_generate_program: !!ent.can_generate_program,
      can_adjust_future: !!ent.can_adjust_future,
      free_cycles_remaining: Number(ent.free_cycles_remaining ?? 0)
    },
    growth_mode: !!system.growth_mode,
    ai_status
  });
}

if (!auth) return forbidden('Login required');
('Login required');
    let userRow: any = null;
try {
  // Always try to upsert the user; if DB is unavailable (e.g., deploy preview without env vars),
  // fall back to an identity-only response so the UI can proceed to onboarding.
  userRow = await upsertUser(auth);
} catch (e) {
  return json(200, {
    user: { id: auth.sub, email: auth.email, role: 'user', created_at: null },
    settings: {
      language: 'en',
      units: 'imperial',
      intensity_style: 'calm',
      auto_adjust_mode: 'off',
      analytics_horizon: 28,
      ai_user_instructions: ''
    },
    onboarding: {
      program_created: false,
      forms_signed_all: true,
      forms_due_at: null,
      forms_required_now: false,
      is_unlocked: true
    },
    entitlements: {
      can_use_ai: false,
      can_generate_program: false,
      can_adjust_future: false,
      free_cycles_remaining: 0
    },
    growth_mode: false,
    ai_status: { enabled: false, reason: 'db_unavailable' },
    db_unavailable: true
  });
}


    // ===== Liability forms gate (after 7 days of use) =====
    // Allow: viewing /me, signing forms, pings, and basic settings even when gated.
    const formsGate = await getFormsGate(userRow.id, userRow.first_seen_at);
    const allowedWhenGated = new Set<string>([
      '/api/me',
      '/api/ping',
      '/api/forms/sign',
      '/api/settings/update',
      '/api/settings/ai-instructions'
    ]);
    if (formsGate.required && !allowedWhenGated.has(path)) {
      return forbidden('Liability forms required to continue using the app. Please sign to unlock.');
    }

    // ===== Onboarding =====
    if (path === '/api/onboarding/complete' && event.httpMethod === 'POST') {
      await sql(
        `insert into onboarding(user_id,is_unlocked) values ($1,true)
         on conflict (user_id) do update set is_unlocked=true`,
        [userRow.id]
      );
      return json(200, { ok: true });
    }

    
    // ===== Program generation (AI stub seeds a demo program) =====
    if (path === '/api/onboarding/program/generate') {
      return await handleOnboardingGenerate({ event, userRow, sql, one, many, json, forbidden, canUseAi });
    }




    // ===== Admin: DB usage =====
    if (path === '/api/admin/db-usage' && event.httpMethod === 'GET') {
      if (!auth) return forbidden('Login required');
      let userRow: any = null;
try {
  // Always try to upsert the user; if DB is unavailable (e.g., deploy preview without env vars),
  // fall back to an identity-only response so the UI can proceed to onboarding.
  userRow = await upsertUser(auth);
} catch (e) {
  return json(200, {
    user: { id: auth.sub, email: auth.email, role: 'user', created_at: null },
    settings: {
      language: 'en',
      units: 'imperial',
      intensity_style: 'calm',
      auto_adjust_mode: 'off',
      analytics_horizon: 28,
      ai_user_instructions: ''
    },
    onboarding: {
      program_created: false,
      forms_signed_all: true,
      forms_due_at: null,
      forms_required_now: false,
      is_unlocked: true
    },
    entitlements: {
      can_use_ai: false,
      can_generate_program: false,
      can_adjust_future: false,
      free_cycles_remaining: 0
    },
    growth_mode: false,
    ai_status: { enabled: false, reason: 'db_unavailable' },
    db_unavailable: true
  });
}

      try {
        requireRole('admin', userRow.role);
      } catch {
        // allow super_admin too
        try {
          requireRole('super_admin', userRow.role);
        } catch {
          return forbidden('Admin only');
        }
      }

      const dbSize = await one<any>('select pg_database_size(current_database()) as bytes');
      const dbPretty = await one<any>('select pg_size_pretty(pg_database_size(current_database())) as pretty');

      // connections can be restricted; fail gracefully
      let connections: any = { active: null, total: null };
      try {
        const conn = await one<any>(`
          select
            count(*) filter (where state = 'active')::int as active,
            count(*)::int as total
          from pg_stat_activity
          where datname = current_database()
        `);
        connections = { active: conn.active, total: conn.total };
      } catch (e) {
        connections = { active: null, total: null };
      }

      const topTables = await many<any>(`
        select
          schemaname,
          relname as table_name,
          pg_total_relation_size(quote_ident(schemaname)||'.'||quote_ident(relname)) as bytes,
          pg_size_pretty(pg_total_relation_size(quote_ident(schemaname)||'.'||quote_ident(relname))) as size_pretty
        from pg_stat_user_tables
        order by bytes desc
        limit 10
      `);

      return json(200, {
        db: { size_bytes: Number(dbSize.bytes), size_pretty: dbPretty.pretty },
        connections,
        top_tables: topTables
      });
    }

// ===== Settings =====
    if (path === '/api/settings/update' && event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const schema = z.object({ language: z.enum(['en', 'es']).optional() });
      const parsed = schema.safeParse(body);
      if (!parsed.success) return badRequest('Invalid payload', parsed.error.flatten());
      if (parsed.data.language) {
        await sql('update users set preferred_language=$2 where id=$1', [userRow.id, parsed.data.language]);
      }
      return json(200, { ok: true });
    }

    if (path === '/api/settings/ai-instructions' && event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const schema = z.object({ ai_user_instructions: z.string().max(500).nullable() });
      const parsed = schema.safeParse(body);
      if (!parsed.success) return badRequest('Invalid payload', parsed.error.flatten());
      await sql('update users set ai_user_instructions=$2, ai_user_instructions_updated_at=now() where id=$1', [userRow.id, parsed.data.ai_user_instructions]);
      return json(200, { ok: true });
    }

    // ===== Promo redeem =====
    if (path === '/api/promo/redeem' && event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const schema = z.object({ code: z.string().min(1).max(64) });
      const parsed = schema.safeParse(body);
      if (!parsed.success) return badRequest('Invalid payload');
      const code = parsed.data.code.trim().toUpperCase();

      const promo = await one<any>('select * from promo_codes where code=$1 and is_active=true', [code]);
      if (!promo) return badRequest('Invalid code');
      if (promo.redeem_by && new Date(promo.redeem_by).getTime() < Date.now()) return badRequest('Code expired');
      if (promo.max_redemptions && promo.redemptions_count >= promo.max_redemptions) return badRequest('Code maxed out');

      const policy = promo.policy || {};
      // prevent duplicate redemption per user per code via unique constraint
      const redemptionId = crypto.randomUUID();
      try {
        // For annual_paid, we create pending redemption first
        const status = policy.billing_mode === 'annual_paid' ? 'pending_checkout' : 'applied';
        const effectiveFrom = new Date().toISOString();
        let effectiveTo: string | null = null;
        if (policy.benefit_duration_days) {
          effectiveTo = new Date(Date.now() + Number(policy.benefit_duration_days) * 86400000).toISOString();
        }
        await sql(
          `insert into promo_redemptions(id,promo_code_id,user_id,status,applied_policy_snapshot,effective_from,effective_to)
           values ($1,$2,$3,$4,$5,$6,$7)`,
          [redemptionId, promo.id, userRow.id, status, policy, effectiveFrom, effectiveTo]
        );
      } catch (e: any) {
        if (String(e?.message || '').includes('unique')) {
          return json(200, { status: 'already_redeemed', message: 'Code already redeemed.' });
        }
        throw e;
      }

      await sql('update promo_codes set redemptions_count = redemptions_count + 1 where id=$1', [promo.id]);

      // Apply entitlements immediately for non-checkout codes
      if (policy.billing_mode !== 'annual_paid') {
        const patch: any = {};
        // minimal: if code says unlock ai forever
        if (policy.billing_mode === 'none') {
          patch.can_use_ai = true;
          patch.can_generate_program = true;
          patch.can_adjust_future = true;
        }
        await applyEntitlements(userRow.id, patch, 'promo');
        return json(200, { status: 'applied', message: 'Code applied.' });
      }

      if (!stripe) return badRequest('Stripe not configured');
      if (!policy.stripe_price_id_annual) return badRequest('Annual price not configured for this code');

      const appUrl = getBaseUrl((event.headers || {}) as any) || '';
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        line_items: [{ price: policy.stripe_price_id_annual, quantity: 1 }],
        success_url: `${appUrl}/?checkout=success`,
        cancel_url: `${appUrl}/?checkout=cancel`,
        client_reference_id: userRow.id,
        metadata: { promo_code: code, redemption_id: redemptionId }
      });

      await sql('update promo_redemptions set stripe_checkout_session_id=$2 where id=$1', [redemptionId, session.id]);

      return json(200, { status: 'checkout_required', checkout_url: session.url, message: 'Checkout required.' });
    }

    
    // ===== Stripe webhook (activates entitlements after payment) =====
    if (path === '/api/stripe/webhook' && event.httpMethod === 'POST') {
      if (!stripe) return badRequest('Stripe not configured');
      const sig = event.headers['stripe-signature'] || event.headers['Stripe-Signature'];
      const whsec = process.env.STRIPE_WEBHOOK_SECRET;
      if (!whsec || !sig) return badRequest('Webhook not configured');

      let evt: any;
      try {
        evt = stripe.webhooks.constructEvent(rawBody, sig as string, whsec);
      } catch (err: any) {
        return { statusCode: 400, body: `Webhook Error: ${err.message}` };
      }

      // Handle checkout success -> set subscription active and apply entitlements
      if (evt.type === 'checkout.session.completed') {
        const session = evt.data.object as any;
        const userId = session.client_reference_id;
        const subscriptionId = session.subscription;
        const customerId = session.customer;
        const redemptionId = session.metadata?.redemption_id;

        if (userId) {
          await sql(
            `insert into subscriptions(user_id,stripe_customer_id,stripe_subscription_id,status)
             values ($1,$2,$3,'active')
             on conflict (user_id) do update set stripe_customer_id=excluded.stripe_customer_id, stripe_subscription_id=excluded.stripe_subscription_id, status='active'`,
            [userId, customerId, subscriptionId]
          );
          await applyEntitlements(userId, { can_use_ai: true, can_generate_program: true, can_adjust_future: true }, 'subscription');
        }

        if (redemptionId) {
          await sql(`update promo_redemptions set status='applied' where id=$1`, [redemptionId]);
        }
      }

      // Keep subscription status in sync
      if (evt.type === 'customer.subscription.updated' || evt.type === 'customer.subscription.deleted') {
        const sub = evt.data.object as any;
        const subId = sub.id;
        const status = String(sub.status || '');
        const periodEnd = sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null;

        const row = await one<any>('select user_id from subscriptions where stripe_subscription_id=$1', [subId]);
        if (row?.user_id) {
          const mapped = status === 'active' ? 'active' : status === 'past_due' ? 'past_due' : status === 'canceled' ? 'canceled' : 'none';
          await sql('update subscriptions set status=$2, current_period_end=$3 where user_id=$1', [row.user_id, mapped, periodEnd]);

          if (mapped === 'active') {
            await applyEntitlements(row.user_id, { can_use_ai: true, can_generate_program: true, can_adjust_future: true }, 'subscription');
          } else {
            // If subscription is not active, do not grant AI (read-only rules still apply elsewhere)
            await applyEntitlements(row.user_id, { can_use_ai: false, can_generate_program: false, can_adjust_future: false }, 'subscription');
          }
        }
      }

      return { statusCode: 200, body: 'ok' };
    }

// ===== Forms signing =====
    if (path === '/api/forms/sign' && event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const schema = z.object({ full_name: z.string().min(3).max(120) });
      const parsed = schema.safeParse(body);
      if (!parsed.success) return badRequest('Invalid payload');

      // Load latest form (liability) or insert placeholder
      let form = await one<any>("select id, form_type, version, content_md from forms order by created_at desc limit 1");
      if (!form) {
        const formId = crypto.randomUUID();
        await sql(
          "insert into forms(id,form_type,version,content_md) values ($1,'liability','v1','Demo liability form content...')",
          [formId]
        );
        form = await one<any>('select id, form_type, version, content_md from forms where id=$1', [formId]);
      }

      // Create a simple PDF placeholder (real PDF generation is a follow-up; this is deployable scaffold)
      const signedAt = new Date().toISOString();
      const pdfText = `SIGNED FORM\n\nUser: ${userRow.email}\nName: ${parsed.data.full_name}\nForm: ${form.form_type} ${form.version}\nSigned at: ${signedAt}`;
      const pdfBase64 = Buffer.from(pdfText, 'utf-8').toString('base64');

      let messageId: string | null = null;
      if (resend) {
        const sent = await resend.emails.send({
          from: process.env.MAIL_FROM || 'forms@zachedwardsllc.com',
          to: [process.env.ADMIN_EMAIL || 'zach@zachedwardsllc.com'],
          subject: `Signed ${form.form_type} ${form.version} - ${userRow.email} - ${signedAt}`,
          text: pdfText,
          attachments: [
            {
              filename: `signed-${form.form_type}-${form.version}-${userRow.id}.txt`,
              content: pdfBase64
            }
          ]
        });
        // @ts-ignore
        messageId = sent?.data?.id || null;
      } else {
        console.log('RESEND_API_KEY not configured. Would email form to admin.');
      }

      const sigId = crypto.randomUUID();
      await sql(
        `insert into form_signatures(id,user_id,form_id,full_name,signed_at,email_message_id)
         values ($1,$2,$3,$4,now(),$5)
         on conflict (user_id, form_id) do nothing`,
        [sigId, userRow.id, form.id, parsed.data.full_name, messageId]
      );

      await sql(
        `insert into onboarding(user_id,is_unlocked) values ($1,false)
         on conflict (user_id) do nothing`,
        [userRow.id]
      );

      return json(200, { ok: true });
    }

    // ===== Chat adjust (AI stub) =====
    
    // ===== Today + logging =====
    if (path === '/api/today') {
      return await handleToday({ event, userId: userRow.id, one, many, json });
    }



    if (path === '/api/workout/log') {
      return await handleWorkoutLog({ event, userId: userRow.id, sql, one, many, json });
    }




    // ===== Chat adjust (one-sentence responses + adjusted plan stored as override) =====
    if (path === '/api/chat/adjust' && event.httpMethod === 'POST') {
      if (!(await canUseAi(userRow))) return forbidden('AI pending approval or not entitled');

      const body = JSON.parse(event.body || '{}');
      const schema = z.object({
        program_day_id: z.string().uuid(),
        request: z.string().min(1).max(2000),
        context: z.any().optional()
      });
      const parsed = schema.safeParse(body);
      if (!parsed.success) return badRequest('Invalid payload', parsed.error.flatten());

      const original = await many<any>(
        `select de.exercise_id, e.slug, e.name, de.prescription
         from day_exercises de join exercises e on e.id=de.exercise_id
         where de.program_day_id=$1
         order by de.order_index asc`,
        [parsed.data.program_day_id]
      );

      const openaiKey = process.env.OPENAI_API_KEY;
      const openaiModel = normalizeModel(process.env.OPENAI_MODEL || 'gpt-5');
      const userPrefs = (userRow.ai_user_instructions || '').trim();

      let message = 'Adjusted today to match your request.';
      let adjustedExercises: any[] | null = null;

      if (openaiKey) {
        const instructions = [
          'You are a cautious strength coach that adjusts training based on readiness, injury, and equipment constraints.',
          'No medical advice. If pain/injury is mentioned, reduce intensity/volume and suggest safer variants.',
          'Return ONLY JSON (no markdown) matching schema:',
          '{ "message": "ONE SENTENCE.", "adjusted_exercises": [ { "exercise_id": "uuid", "prescription": { "sets": 3, "reps": 5, "load": 100, "rpe": 6 } } ] }',
          'Hard rules:',
          '- message MUST be exactly one sentence.',
          '- Keep changes conservative (<=10% weekly volume delta; for today: reduce sets/load modestly).',
          userPrefs ? `User preferences (non-authoritative): ${userPrefs}` : ''
        ].filter(Boolean).join('\n');

        const input = {
          request: parsed.data.request,
          context: parsed.data.context || {},
          settings: { units: userRow.units, intensity_style: userRow.intensity_style, auto_adjust_mode: userRow.auto_adjust_mode },
          original_exercises: original.map((x: any) => ({
            exercise_id: x.exercise_id,
            slug: x.slug,
            name: x.name,
            prescription: x.prescription
          }))
        };

        try {
          const text = await callResponsesAPI(input, instructions, { apiKey: openaiKey, model: openaiModel });
          const obj = extractJsonBlock(text);
          message = oneSentence(String(obj.message || message));
          adjustedExercises = Array.isArray(obj.adjusted_exercises) ? obj.adjusted_exercises : null;
        } catch (e: any) {
          console.error('OpenAI adjust failed:', e?.message || e);
        }
      }

      // Fallback heuristic if AI not configured or failed
      if (!adjustedExercises) {
        const req = parsed.data.request.toLowerCase();
        adjustedExercises = original.map((ex: any) => {
          const p = ex.prescription || {};
          const next = { ...p };
          if (req.includes('tired') || req.includes('fatigue') || req.includes('low')) {
            next.sets = Math.max(1, (p.sets ?? 3) - 1);
            next.rpe = Math.max(5, (p.rpe ?? 7) - 1);
          }
          if (req.includes('injur') || req.includes('pain')) {
            next.sets = 1; next.rpe = 6; next.load = Math.max(0, (p.load ?? 0) * 0.7);
          }
          if (req.includes('hotel') || req.includes('bodyweight') || req.includes('no equipment')) {
            next.load = 0; next.reps = 12; next.sets = Math.max(2, p.sets ?? 3);
          }
          return { exercise_id: ex.exercise_id, prescription: next };
        });
        message = oneSentence(message);
      }

      // Merge adjusted prescriptions with original names for UI toggle
      const byId = new Map(adjustedExercises.map((x: any) => [x.exercise_id, x.prescription]));
      const adjustedForUi = original.map((ex: any) => ({
        exercise_id: ex.exercise_id,
        name: ex.name,
        prescription: byId.get(ex.exercise_id) || ex.prescription
      }));

      const adjusted = { program_day_id: parsed.data.program_day_id, name: 'Adjusted', exercises: adjustedForUi };

      await sql(
        `insert into day_overrides(program_day_id,adjusted) values ($1,$2::jsonb)
         on conflict (program_day_id) do update set adjusted=excluded.adjusted, updated_at=now()`,
        [parsed.data.program_day_id, JSON.stringify(adjusted)]
      );

      return json(200, { message, adjusted });
    }


    

    // Default: unknown route
    return json(404, { error: 'not_found' });
  } catch (e: any) {
    console.error('API error:', e?.message || e);
    return json(500, { error: 'server_error' });
  }
};
function getBaseUrl(headers: Record<string, string | undefined>) {
  const proto = headers['x-forwarded-proto'] || 'https';
  const host = headers['x-forwarded-host'] || headers['host'];
  return host ? `${proto}://${host}` : '';
}


