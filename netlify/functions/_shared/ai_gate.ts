async function canUseAi(userRow: any): Promise<boolean> {
  const ent = await getEntitlements(userRow.id);
  if (!ent.can_use_ai) return false;
  const status = await resolveAiStatus(userRow);
  return status !== 'pending';
}
