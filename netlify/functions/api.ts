import type { Handler } from '@netlify/functions';
import { z } from 'zod';
import Stripe from 'stripe';
import { Resend } from 'resend';
import { json, badRequest, forbidden, notFound } from './_shared/http';
import { requireAuth, requireRole } from './_shared/auth';
import { many, one, sql } from './_shared/db';
import { getSystemSettings, isGrandfathered } from './_shared/gates';
import { ensureBaseRows, getEntitlements, applyEntitlements, hasActivePromoBypass } from './_shared/entitlements';
import { callResponsesAPI, extractJsonBlock, oneSentence } from './_shared/ai';

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

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(200, { ok: true });

  const path = getPath(event);
  const auth = await requireAuth(event.headers.authorization || event.headers.Authorization);

  const rawBody = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : (event.body || '');

  try {
    // Public ping
    if (path === '/api/ping') return json(200, { ok: true });

    // ===== Auth-required routes =====
    if (path === '/api/me') {
      if (!auth) return forbidden('Login required');
      const userRow = await upsertUser(auth);
      const ent = await getEntitlements(userRow.id);
      const system = await getSystemSettings();

      const program = await one<any>('select id from programs where user_id=$1 and status=\'active\' limit 1', [userRow.id]);
      const formsGate = await getFormsGate(userRow.id, userRow.first_seen_at);
      const unlocked = await one<any>('select is_unlocked from onboarding where user_id=$1', [userRow.id]);

      const ai_status = await resolveAiStatus(userRow);

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
          forms_signed_all: formsGate.signed,
          forms_due_at: formsGate.due_at,
          forms_required_now: formsGate.required,
          is_unlocked: !!unlocked?.is_unlocked
        },
        entitlements: {
          can_use_ai: ent.can_use_ai,
          can_generate_program: ent.can_generate_program,
          can_adjust_future: ent.can_adjust_future,
          free_cycles_remaining: ent.free_cycles_remaining
        },
        growth_mode: system.growth_mode,
        ai_status
      });
    }

    if (!auth) return forbidden('Login required');
    const userRow = await upsertUser(auth);

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
    if (path === '/api/onboarding/program/generate' && event.httpMethod === 'POST') {
      if (!(await canUseAi(userRow))) return forbidden('AI pending approval or not entitled');

      
      const today = new Date();
      const startIso = today.toISOString().slice(0, 10);
      const endIso = new Date(today.getTime() + 27 * 86400000).toISOString().slice(0, 10);
      const programId = crypto.randomUUID();

      // Create program shell
      await sql(
        `insert into programs(id,user_id,status,start_date,end_date,generated_from_program_id,generation_source)
         values ($1,$2,'active',$3,$4,null,'ai')
         on conflict do nothing`,
        [programId, userRow.id, startIso, endIso]
      );

      // Load basic profile/settings for personalization
      const profile = await one<any>('select * from profiles where user_id=$1', [userRow.id]);

      // Build program with OpenAI (Responses API). If not configured or parse fails, fallback to a sane seeded plan.
      const openaiKey = process.env.OPENAI_API_KEY;
      const openaiModel = process.env.OPENAI_MODEL || 'gpt-5';
      let plan: any | null = null;

      if (openaiKey) {
        const userPrefs = (userRow.ai_user_instructions || '').trim();
        const instructions = [
          'You are a strength and hypertrophy programming assistant.',
          'Return ONLY JSON (no markdown) matching the provided schema.',
          'Constraints:',
          '- Do not give medical advice. If injury/pain is mentioned, keep substitutions conservative.',
          '- Keep weekly volume change within 10%.',
          '- Use the user\'s units and intensity_style (rpe/percent/none).',
          'Schema:',
          '{ "days": [ { "week_index": 1, "day_index": 1, "name": "Training Day 1", "exercises": [ { "slug": "bench_press", "name": "Bench Press", "prescription": { "sets": 3, "reps": 5, "load": 100, "rpe": 6 } } ] } ] }',
          'Notes: Provide 4 weeks * 4 days = 16 days total for v1. Keep exercise list simple and repeatable.',
          userPrefs ? `User preferences (non-authoritative): ${userPrefs}` : ''
        ].filter(Boolean).join('\n');

        const input = {
          profile,
          settings: {
            units: userRow.units,
            intensity_style: userRow.intensity_style,
            days_per_week: profile?.days_per_week ?? 4,
            focus: profile?.focus ?? 'hybrid',
            experience_level: profile?.experience_level ?? 'novice',
            equipment_profile: profile?.equipment_profile ?? 'full_gym',
            training_emphasis: profile?.training_emphasis ?? 'balanced'
          }
        };

        try {
          const text = await callResponsesAPI(input, instructions, { apiKey: openaiKey, model: openaiModel });
          plan = extractJsonBlock(text);
        } catch (e: any) {
          console.error('OpenAI program generation failed:', e?.message || e);
          plan = null;
        }
      }

      // Fallback plan if AI not configured or parse failed
      if (!plan || !Array.isArray(plan.days)) {
        plan = {
          days: Array.from({ length: 16 }).map((_, i) => {
            const idx = i + 1;
            const week = Math.floor((idx - 1) / 4) + 1;
            const di = ((idx - 1) % 4) + 1;
            const lift = ['bench_press', 'squat', 'deadlift', 'overhead_press'][di - 1];
            const name = lift.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
            return {
              week_index: week,
              day_index: di,
              name: `Training Day ${idx}`,
              exercises: [
                { slug: lift, name, prescription: { sets: 3, reps: 5, load: 100, rpe: 6 } }
              ]
            };
          })
        };
      }

      // Ensure exercise library entries exist and map slug->id
      const slugs = Array.from(new Set(plan.days.flatMap((d: any) => (d.exercises || []).map((x: any) => x.slug)).filter(Boolean)));
      for (const s of slugs) {
        const nm = String(s).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
        await sql(
          `insert into exercises(id,slug,name) values ($1,$2,$3)
           on conflict (slug) do update set name=excluded.name`,
          [crypto.randomUUID(), s, nm]
        );
      }
      const exRows = await many<any>('select id,slug,name from exercises where slug = any($1::text[])', [slugs]);
      const slugToId = new Map<string, string>(exRows.map((r: any) => [r.slug, r.id]));

      // Insert program days and exercises, scheduled on consecutive days starting today
      let dayCursor = new Date(today.getTime());
      for (const d of plan.days) {
        const pdId = crypto.randomUUID();
        const scheduled = dayCursor.toISOString().slice(0,10);

        await sql(
          `insert into program_days(id,program_id,week_index,day_index,name,scheduled_date)
           values ($1,$2,$3,$4,$5,$6)
           on conflict do nothing`,
          [pdId, programId, d.week_index, d.day_index, d.name || 'Training Day', scheduled]
        );

        let order = 1;
        for (const ex of (d.exercises || [])) {
          const exId = slugToId.get(ex.slug);
          if (!exId) continue;
          await sql(
            `insert into day_exercises(id,program_day_id,exercise_id,order_index,prescription)
             values ($1,$2,$3,$4,$5::jsonb)
             on conflict do nothing`,
            [crypto.randomUUID(), pdId, exId, order, JSON.stringify(ex.prescription || { sets: 3, reps: 5, load: 0 })]
          );
          order++;
        }

        dayCursor = new Date(dayCursor.getTime() + 86400000);
      }

      // ensure onboarding row exists
      await sql(
        `insert into onboarding(user_id,is_unlocked) values ($1,true)
         on conflict (user_id) do nothing`,
        [userRow.id]
      );

      // seed trial entitlements if absent (first free program)
      const ent = await one<any>('select user_id from entitlements where user_id=$1', [userRow.id]);
      if (!ent) {
        await applyEntitlements(
          userRow.id,
          { can_use_ai: true, can_generate_program: true, can_adjust_future: true, free_cycles_remaining: 1 },
          'system'
        );
      }
return json(200, { ok: true, program_id: programId });
    }


    // ===== Admin: DB usage =====
    if (path === '/api/admin/db-usage' && event.httpMethod === 'GET') {
      if (!auth) return forbidden('Login required');
      const userRow = await upsertUser(auth);
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

      const appUrl = process.env.APP_URL || process.env.URL || 'http://localhost:8888';
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
    if (path === '/api/today' && event.httpMethod === 'GET') {
      const prog = await one<any>(
        `select id,start_date,end_date from programs where user_id=$1 and status='active' order by created_at desc limit 1`,
        [userRow.id]
      ).catch(() => null);

      if (!prog) return json(200, { has_program: false });

      const startDate = new Date(String(prog.start_date) + 'T00:00:00Z');
      const now = new Date();
      const dayNumber = Math.min(28, Math.max(1, Math.floor((now.getTime() - startDate.getTime()) / 86400000) + 1));

      const pd = await one<any>(
        `select id,day_index,scheduled_date,name from program_days where program_id=$1 and day_index=$2`,
        [prog.id, dayNumber]
      ).catch(() => null);

      if (!pd) return json(200, { has_program: true, program: prog, day: null });

      const exRows = await many<any>(
        `select de.order_index, e.name, e.slug, de.prescription
         from day_exercises de
         join exercises e on e.id = de.exercise_id
         where de.program_day_id=$1
         order by de.order_index asc`,
        [pd.id]
      );

      return json(200, {
        has_program: true,
        program: { id: prog.id, start_date: prog.start_date, end_date: prog.end_date },
        day: { id: pd.id, day_index: pd.day_index, scheduled_date: pd.scheduled_date, name: pd.name },
        exercises: exRows
      });
    }

    if (path === '/api/workout/log' && event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const schema = z.object({
        program_day_id: z.string().uuid().optional().nullable(),
        status: z.enum(['completed','partial','skipped']).default('completed'),
        log_as_prescribed: z.boolean().optional().default(false),
        sets: z.array(z.object({
          exercise_slug: z.string(),
          set_index: z.number().int().min(1),
          reps: z.number().int().min(0),
          load: z.number(),
          rpe: z.number().optional().nullable()
        })).optional().default([]),
        deviations: z.array(z.object({
          type: z.string(),
          reason_category: z.string(),
          diff: z.any(),
          approval_source: z.enum(['bot','user']).optional()
        })).optional().default([])
      });
      const parsed = schema.parse(body);
      const workoutId = crypto.randomUUID();
      await sql(
        `insert into workouts(id,user_id,program_day_id,status) values ($1,$2,$3,$4)`,
        [workoutId, userRow.id, parsed.program_day_id || null, parsed.status]
      );

      // If log_as_prescribed, create sets based on prescription with placeholder loads (0)
      if (parsed.log_as_prescribed && parsed.program_day_id) {
        const exRows = await many<any>(
          `select e.slug, e.id as exercise_id, de.prescription
           from day_exercises de join exercises e on e.id=de.exercise_id
           where de.program_day_id=$1 order by de.order_index asc`,
          [parsed.program_day_id]
        );
        for (const ex of exRows) {
          const sets = Number(ex.prescription?.sets || 0);
          const reps = Number(ex.prescription?.reps || 0);
          for (let i = 1; i <= sets; i++) {
            await sql(
              `insert into workout_sets(id,workout_id,exercise_id,set_index,reps,load,rpe,is_warmup)
               values ($1,$2,$3,$4,$5,$6,$7,false)`,
              [crypto.randomUUID(), workoutId, ex.exercise_id, i, reps, 0, null]
            );
          }
        }
      } else {
        // Manual sets
        for (const s of parsed.sets) {
          const ex = await one<any>(`select id from exercises where slug=$1`, [s.exercise_slug]).catch(() => null);
          if (!ex) continue;
          await sql(
            `insert into workout_sets(id,workout_id,exercise_id,set_index,reps,load,rpe,is_warmup)
             values ($1,$2,$3,$4,$5,$6,$7,false)`,
            [crypto.randomUUID(), workoutId, ex.id, s.set_index, s.reps, s.load, s.rpe ?? null]
          );
        }
      }

      for (const d of parsed.deviations) {
        await sql(
          `insert into deviations(id,workout_id,type,diff,reason_category,approval_source)
           values ($1,$2,$3,$4,$5,$6)`,
          [crypto.randomUUID(), workoutId, d.type, d.diff, d.reason_category, d.approval_source || 'user']
        );
      }

      return json(200, { ok: true, workout_id: workoutId });
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
      const openaiModel = process.env.OPENAI_MODEL || 'gpt-5';
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
