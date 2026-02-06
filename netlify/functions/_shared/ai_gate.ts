import { getEntitlements, hasActivePromoBypass } from './entitlements';
import { getSystemSettings, isGrandfathered } from './gates';

export type AiStatus = 'approved' | 'grandfathered' | 'promo_bypass' | 'pending';

export async function resolveAiStatus(userRow: any): Promise<AiStatus> {
  const settings = await getSystemSettings();
  const ent = await getEntitlements(userRow.id);
  const bypass = await hasActivePromoBypass(userRow.id);

  // If the user isn't entitled, treat as pending (gate checked by canUseAi()).
  if (!ent.can_use_ai) return 'pending';

  if (settings.growth_mode === 'free_flow') return 'approved';
  const grandfathered = await isGrandfathered(userRow.created_at, settings.ai_gate_start_at);
  if (grandfathered) return 'grandfathered';
  if (userRow.ai_approved_at) return 'approved';
  if (bypass) return 'promo_bypass';
  return 'pending';
}

export async function canUseAi(userRow: any): Promise<boolean> {
  const ent = await getEntitlements(userRow.id);
  if (!ent.can_use_ai) return false;
  const status = await resolveAiStatus(userRow);
  return status !== 'pending';
}
