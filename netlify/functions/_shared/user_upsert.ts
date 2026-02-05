import { one, sql } from './db_helpers';

export async function upsertUser(auth: { sub: string; email: string }) {
  // Netlify Identity `sub` is typically a UUID string
  await sql(
    `insert into users(id,email,role)
     values ($1,$2,'user')
     on conflict (id) do update set email = excluded.email`,
    [auth.sub, auth.email]
  );

  // Ensure onboarding row exists (safe no-op if already there)
  await sql(
    `insert into onboarding(user_id,is_unlocked)
     values ($1,false)
     on conflict (user_id) do nothing`,
    [auth.sub]
  );

  return await one<any>(
    `select id,email,display_name,role,created_at,first_seen_at,
            preferred_language,units,intensity_style,auto_adjust_mode,analytics_horizon,
            ai_user_instructions,ai_approved_at
     from users
     where id=$1`,
    [auth.sub]
  );
}
