import type { HandlerEvent } from '@netlify/functions';
import { upsertUser } from '../_shared/user_upsert';
import { getSystemSettings } from '../_shared/gates';
import { getEntitlements } from '../_shared/entitlements';
import { isGrandfathered } from '../_shared/gates';

export async function handleMe(opts: {
  event: HandlerEvent;
  auth: { sub: string; email: string } | null;
  json: (code: number, body: any) => any;
  forbidden: (message: string) => any;
  one: <T>(q: string, params?: any[]) => Promise<T>;
}) {
  const { auth, json, forbidden, one } = opts;

  if (!auth) return forbidden('Login required');

  // Upsert user (creates base rows and returns canonical user record)
  const userRow = await upsertUser(auth);

  // System settings
  const system = await getSystemSettings();

  // Entitlements
  const ent = await getEntitlements(userRow.id);

  // Onboarding signals
  const program = await one<any>(
    `select id from programs where user_id=$1 and status='active' limit 1`,
    [userRow.id]
  );

  const onboarding = await one<any>(
    `select is_unlocked from onboarding where user_id=$1`,
    [userRow.id]
  );

  // Liability/forms gate (optional table; tolerate absence by defaulting to signed)
  let formsSignedAll = true;
  let formsDueAt: string | null = null;
  let formsRequiredNow = false;

  try {
    const forms = await one<any>(
      `select signed_all, due_at, required_now from forms_gate where user_id=$1`,
      [userRow.id]
    );
    if (forms) {
      formsSignedAll = !!forms.signed_all;
      formsDueAt = forms.due_at ? new Date(forms.due_at).toISOString() : null;
      formsRequiredNow = !!forms.required_now;
    }
  } catch {
    // If table doesn't exist yet, don't block the UI
  }

  // AI status (simple + consistent with UI types)
  const ai_status =
    (await (async () => {
      try {
        if (await isGrandfathered(userRow.id)) return 'grandfathered';
      } catch {
        // ignore
      }
      if (userRow.ai_approved_at) return 'approved';
      // Promo bypass (if entitlements grant AI without approval)
      if (ent?.can_use_ai) return 'promo_bypass';
      return 'pending';
    })()) as 'grandfathered' | 'approved' | 'pending' | 'promo_bypass';

  return json(200, {
    user: { id: userRow.id, email: userRow.email, role: userRow.role, created_at: userRow.created_at },
    settings: {
      language: userRow.preferred_language,
      units: userRow.units,
      intensity_style: userRow.intensity_style,
      auto_adjust_mode: userRow.auto_adjust_mode,
      analytics_horizon: userRow.analytics_horizon,
      ai_user_instructions: userRow.ai_user_instructions ?? null
    },
    onboarding: {
      program_created: !!program,
      forms_signed_all: formsSignedAll,
      forms_due_at: formsDueAt,
      forms_required_now: formsRequiredNow,
      is_unlocked: !!onboarding?.is_unlocked
    },
    entitlements: {
      can_use_ai: !!ent?.can_use_ai,
      can_generate_program: !!ent?.can_generate_program,
      can_adjust_future: !!ent?.can_adjust_future,
      free_cycles_remaining: Number(ent?.free_cycles_remaining ?? 0)
    },
    growth_mode: system.growth_mode,
    ai_status
  });
}
