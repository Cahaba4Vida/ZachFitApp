import { many, one, sql } from './db';

export type Entitlements = {
  can_use_ai: boolean;
  can_generate_program: boolean;
  can_adjust_future: boolean;
  can_track_body_metrics: boolean;
  free_cycles_remaining: number;
  effective_to: string | null;
};

export async function ensureBaseRows(userId: string) {
  await sql(
    'insert into subscriptions(user_id,status) values ($1,\'none\') on conflict (user_id) do nothing',
    [userId]
  );
  await sql(
    'insert into entitlements(user_id,can_use_ai,can_generate_program,can_adjust_future,can_track_body_metrics,free_cycles_remaining,source) values ($1,false,false,false,false,0,\'system\') on conflict (user_id) do nothing',
    [userId]
  );
  // v1: users can enter the app immediately; liability forms are enforced after a 7-day grace period.
  await sql(
    'insert into onboarding(user_id,is_unlocked) values ($1,true) on conflict (user_id) do nothing',
    [userId]
  );
}

export async function getEntitlements(userId: string): Promise<Entitlements> {
  const row = await one<any>(
    'select can_use_ai, can_generate_program, can_adjust_future, can_track_body_metrics, free_cycles_remaining, effective_to from entitlements where user_id=$1',
    [userId]
  );
  if (!row) {
    return {
      can_use_ai: false,
      can_generate_program: false,
      can_adjust_future: false,
      can_track_body_metrics: false,
      free_cycles_remaining: 0,
      effective_to: null
    };
  }
  return {
    can_use_ai: !!row.can_use_ai,
    can_generate_program: !!row.can_generate_program,
    can_adjust_future: !!row.can_adjust_future,
    can_track_body_metrics: !!row.can_track_body_metrics,
    free_cycles_remaining: Number(row.free_cycles_remaining ?? 0),
    effective_to: row.effective_to
  };
}

export async function applyEntitlements(userId: string, patch: Partial<Entitlements>, source: string) {
  const existing = await getEntitlements(userId);
  const merged = { ...existing, ...patch };
  await sql(
    `update entitlements set
      can_use_ai=$2,
      can_generate_program=$3,
      can_adjust_future=$4,
      can_track_body_metrics=$5,
      free_cycles_remaining=$6,
      source=$7
    where user_id=$1`,
    [
      userId,
      merged.can_use_ai,
      merged.can_generate_program,
      merged.can_adjust_future,
      merged.can_track_body_metrics,
      merged.free_cycles_remaining,
      source
    ]
  );
}

export async function hasActivePromoBypass(userId: string): Promise<boolean> {
  const rows = await many<any>(
    `select pr.applied_policy_snapshot, pr.effective_to
     from promo_redemptions pr
     join promo_codes pc on pc.id = pr.promo_code_id
     where pr.user_id=$1 and pr.status in ('applied','pending_checkout')`,
    [userId]
  );
  const now = Date.now();
  for (const r of rows) {
    const policy = r.applied_policy_snapshot || {};
    if (!policy.bypass_ai_gate) continue;
    if (r.effective_to && new Date(r.effective_to).getTime() < now) continue;
    return true;
  }
  return false;
}
