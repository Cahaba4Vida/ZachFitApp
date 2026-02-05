import { neon } from '@neondatabase/serverless';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  // eslint-disable-next-line no-console
  console.warn('DATABASE_URL not set. Functions will fail until configured.');
}

export const sql = neon(DATABASE_URL || '');

export async function one<T>(query: string, params: any[] = []): Promise<T | null> {
  const rows: any[] = await sql(query, params as any);
  return rows[0] ?? null;
}

export async function many<T>(query: string, params: any[] = []): Promise<T[]> {
  const rows: any[] = await sql(query, params as any);
  return rows as T[];
}
