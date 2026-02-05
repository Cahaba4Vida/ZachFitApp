import { getEntitlements } from './entitlements';

export async function canUseAi(userRow: any): Promise<boolean> {
  const ent = await getEntitlements(userRow.id);
  return !!ent?.can_use_ai;
}
