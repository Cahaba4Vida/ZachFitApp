import { one } from './db';

export type GrowthMode = 'free_flow' | 'limited_flow';

export async function getSystemSettings() {
  const row = await one<{ growth_mode: GrowthMode; ai_gate_start_at: string | null }>(
    'select growth_mode, ai_gate_start_at from system_settings where id = true'
  );
  return row || { growth_mode: 'free_flow' as GrowthMode, ai_gate_start_at: null };
}

export async function getUserRow(userId: string) {
  return await one<any>('select * from users where id = $1', [userId]);
}

export async function isGrandfathered(userCreatedAt: string, gateStart: string | null) {
  if (!gateStart) return true;
  return new Date(userCreatedAt).getTime() < new Date(gateStart).getTime();
}
