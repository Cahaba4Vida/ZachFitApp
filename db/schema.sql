-- ZL FitApp (Neon Postgres) schema

create type role_t as enum ('user','coach','admin','super_admin');
create type growth_mode_t as enum ('free_flow','limited_flow');
create type subscription_status_t as enum ('none','trial','active','past_due','canceled');
create type program_status_t as enum ('active','archived');

create table if not exists system_settings (
  id boolean primary key default true,
  growth_mode growth_mode_t not null default 'free_flow',
  ai_gate_start_at timestamptz null,
  updated_at timestamptz not null default now(),
  updated_by uuid null
);

insert into system_settings(id) values (true) on conflict do nothing;

create table if not exists users (
  id uuid primary key,
  email text unique not null,
  display_name text null,
  role role_t not null default 'user',
  created_at timestamptz not null default now(),

  -- First time we saw the user hit the app (used for form due date)
  first_seen_at timestamptz null,

  ai_approved_at timestamptz null,
  ai_approved_by uuid null,

  preferred_language text not null default 'en',
  units text not null default 'kg',
  intensity_style text not null default 'rpe',
  auto_adjust_mode text not null default 'today_only',
  analytics_horizon text not null default '12mo',
  ai_user_instructions text null,
  ai_user_instructions_updated_at timestamptz null
);

-- Onboarding lock
create table if not exists onboarding (
  user_id uuid primary key references users(id) on delete cascade,
  is_unlocked boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists subscriptions (
  user_id uuid primary key references users(id) on delete cascade,
  stripe_customer_id text null,
  stripe_subscription_id text null,
  status subscription_status_t not null default 'none',
  current_period_end timestamptz null
);

create table if not exists entitlements (
  user_id uuid primary key references users(id) on delete cascade,
  can_use_ai boolean not null default false,
  can_generate_program boolean not null default false,
  can_adjust_future boolean not null default false,
  can_track_body_metrics boolean not null default false,
  free_cycles_remaining int not null default 0,
  source text not null default 'system',
  effective_from timestamptz not null default now(),
  effective_to timestamptz null
);

create table if not exists programs (
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  status program_status_t not null default 'active',
  start_date date not null,
  end_date date not null,
  created_at timestamptz not null default now(),
  created_from_program_id uuid null,
  generation_source text not null
);

-- Forms (PDF emailed to admin; store signature receipt)
create table if not exists forms (
  id uuid primary key,
  form_type text not null,
  version text not null,
  content_md text not null,
  created_at timestamptz not null default now(),
  unique(form_type, version)
);

create table if not exists form_signatures (
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  form_id uuid not null references forms(id),
  full_name text not null,
  signed_at timestamptz not null default now(),
  email_message_id text null,
  pdf_sha256 text null,
  unique(user_id, form_id)
);

-- Broadcast messaging
create table if not exists broadcasts (
  id uuid primary key,
  title text not null,
  body text not null,
  audience_filter jsonb not null default '{}'::jsonb,
  created_by uuid not null references users(id),
  created_at timestamptz not null default now()
);

create table if not exists broadcast_reads (
  broadcast_id uuid not null references broadcasts(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (broadcast_id, user_id)
);

-- Admin assistant transcripts (auto-delete after 30 days)
create table if not exists admin_assistant_threads (
  id uuid primary key,
  created_by uuid not null references users(id),
  title text null,
  expires_at timestamptz not null default (now() + interval '30 days'),
  created_at timestamptz not null default now()
);

create index if not exists admin_assistant_threads_expires_at_idx on admin_assistant_threads (expires_at);

create table if not exists admin_assistant_messages (
  id uuid primary key,
  thread_id uuid not null references admin_assistant_threads(id) on delete cascade,
  role text not null check (role in ('admin','assistant','system')),
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Promo codes (policy-based)
create table if not exists promo_codes (
  id uuid primary key,
  code text unique not null,
  is_active boolean not null default true,
  redeem_by timestamptz null,
  max_redemptions int null,
  redemptions_count int not null default 0,
  policy jsonb not null,
  created_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  notes text null
);

create table if not exists promo_redemptions (
  id uuid primary key,
  promo_code_id uuid not null references promo_codes(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  redeemed_at timestamptz not null default now(),
  status text not null default 'applied',
  applied_policy_snapshot jsonb not null,
  effective_from timestamptz not null default now(),
  effective_to timestamptz null,
  stripe_checkout_session_id text null,
  unique(promo_code_id, user_id)
);


-- ===== Core training data =====
create table if not exists exercises (
  id uuid primary key,
  slug text unique not null,
  name text not null,
  muscle_group text null
);

create table if not exists program_days (
  id uuid primary key,
  program_id uuid not null references programs(id) on delete cascade,
  day_index int not null, -- 1..28
  scheduled_date date not null,
  name text not null,
  unique(program_id, day_index),
  unique(program_id, scheduled_date)
);

create table if not exists day_exercises (
  id uuid primary key,
  program_day_id uuid not null references program_days(id) on delete cascade,
  exercise_id uuid not null references exercises(id),
  order_index int not null,
  prescription jsonb not null, -- {sets,reps,intensity:{type,value},notes}
  unique(program_day_id, order_index)
);

create type workout_status_t as enum ('completed','partial','skipped');

create table if not exists workouts (
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  program_day_id uuid null references program_days(id),
  performed_at timestamptz not null default now(),
  status workout_status_t not null,
  notes text null
);

create table if not exists workout_sets (
  id uuid primary key,
  workout_id uuid not null references workouts(id) on delete cascade,
  exercise_id uuid not null references exercises(id),
  set_index int not null,
  reps int not null,
  load numeric not null,
  rpe numeric null,
  is_warmup boolean not null default false
);

create table if not exists deviations (
  id uuid primary key,
  workout_id uuid not null references workouts(id) on delete cascade,
  type text not null, -- swap/volume/intensity/remove/add
  diff jsonb not null,
  reason_category text not null, -- readiness/injury/equipment/time/other
  approval_source text not null default 'user', -- 'bot' | 'user' (SYSTEM ONLY)
  created_at timestamptz not null default now()
);

