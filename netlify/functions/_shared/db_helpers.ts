import { sql as neonSql } from './db';

export async function sql(query: string, params: any[] = []) {
  // Neon serverless client supports sql(query, params)
  return await (neonSql as any)(query, params);
}

export async function one<T>(query: string, params: any[] = []): Promise<T> {
  const rows: any = await sql(query, params);
  return rows?.[0] as T;
}

export async function many<T>(query: string, params: any[] = []): Promise<T[]> {
  const rows: any = await sql(query, params);
  return (rows || []) as T[];
}
