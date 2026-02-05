export function normalizeModel(model: string | undefined | null): string {
  const m = (model || '').trim();
  if (!m) return 'gpt-4o-mini';
  if (m.toLowerCase().startsWith('gpt-5')) return 'gpt-4o-mini';
  return m;
}
