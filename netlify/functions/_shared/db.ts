import { neon } from '@neondatabase/serverless';

let _sql: ReturnType<typeof neon> | null = null;

function init() {
  const url = process.env.DATABASE_URL || process.env.NETLIFY_DATABASE_URL_UNPOOLED || '';
  if (!url) throw new Error('DATABASE_URL is not configured');
  if (!_sql) _sql = neon(url);
  return _sql;
}

// `getSql()` remains a tagged-template function compatible with `sql\`...\``.
export const sql: ReturnType<typeof neon> = ((...args: any[]) => {
  const s = init();
  // @ts-ignore
  return s(...args);
}) as any;

export function getSql() {
  return init();
}

export async function many<T>(query: string, params: any[] = []): Promise<T[]> {
  const rows: any = await (sql as any)(query, params);
  return (rows || []) as T[];
}

export async function one<T>(query: string, params: any[] = []): Promise<T> {
  const rows: any = await (sql as any)(query, params);
  return (rows?.[0] as T) ?? (null as any);
}
