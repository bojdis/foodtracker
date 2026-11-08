-- FoodTracker initial schema migration (applied to Supabase project kgkljsdfdfptbsoqoold)
-- Includes pgvector, single-owner user_profiles, meal_templates, daily_summaries,
-- log_entries, entry_items, RLS policies, deterministic recalculate_daily_summary RPC,
-- match_meal_templates vector similarity RPC, and Supabase Realtime publication.

create extension if not exists vector with schema extensions;

create table public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  singleton_lock boolean not null default true
    constraint user_profiles_singleton_unique unique
    constraint user_profiles_singleton_true check (singleton_lock = true),
  display_name text not null default 'Radek',
  sex text not null default 'male' check (sex in ('male', 'female')),
  birth_year smallint not null check (birth_year between 1920 and 2025),
  height_cm smallint not null check (height_cm between 100 and 250),
  weight_kg numeric(5,1) not null check (weight_kg between 30 and 300),
  activity_level text not null default 'sedentary'
    check (activity_level in ('sedentary', 'light', 'moderate', 'active')),
  activity_multiplier numeric(4,2) not null default 1.20
    check (activity_multiplier between 1.00 and 2.50),
  bmr_kcal integer not null check (bmr_kcal > 0),
  base_expenditure_kcal integer not null check (base_expenditure_kcal > 0),
  target_deficit_kcal integer not null default 0 check (target_deficit_kcal between -2000 and 2000),
  protein_target_g integer not null default 140 check (protein_target_g >= 0),
  carbs_target_g integer not null default 220 check (carbs_target_g >= 0),
  fat_target_g integer not null default 70 check (fat_target_g >= 0),
  fiber_target_g integer not null default 30 check (fiber_target_g >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.meal_templates (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  canonical_name text not null,
  normalized_items_summary text not null default '',
  typical_time_slot text not null default 'anytime'
    check (typical_time_slot in ('morning', 'lunch', 'snack', 'evening', 'anytime')),
  occurrence_count integer not null default 1 check (occurrence_count >= 1),
  is_quick_check boolean not null default false,
  is_hidden boolean not null default false,
  avg_portion_grams integer,
  avg_kcal integer not null default 0 check (avg_kcal >= 0),
  avg_protein_g numeric(6,1) not null default 0 check (avg_protein_g >= 0),
  avg_carbs_g numeric(6,1) not null default 0 check (avg_carbs_g >= 0),
  avg_fat_g numeric(6,1) not null default 0 check (avg_fat_g >= 0),
  avg_fiber_g numeric(6,1) not null default 0 check (avg_fiber_g >= 0),
  template_items jsonb not null default '[]'::jsonb,
  embedding extensions.vector(768),
  last_eaten_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index meal_templates_user_id_idx on public.meal_templates (user_id);
create index meal_templates_quick_check_idx on public.meal_templates (user_id, is_quick_check)
  where is_quick_check = true and is_hidden = false;
create index meal_templates_embedding_idx on public.meal_templates
  using hnsw (embedding extensions.vector_cosine_ops);

create table public.daily_summaries (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  log_date date not null,
  intake_kcal integer not null default 0,
  base_expenditure_kcal integer not null default 0,
  burned_activity_kcal integer not null default 0,
  burned_total_kcal integer not null default 0,
  net_kcal integer not null default 0,
  protein_g numeric(6,1) not null default 0,
  carbs_g numeric(6,1) not null default 0,
  fat_g numeric(6,1) not null default 0,
  fiber_g numeric(6,1) not null default 0,
  entries_count integer not null default 0,
  pending_count integer not null default 0,
  updated_at timestamptz not null default now(),
  constraint daily_summaries_user_date_unique unique (user_id, log_date)
);

create index daily_summaries_user_date_idx on public.daily_summaries (user_id, log_date desc);

create table public.log_entries (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  log_date date not null,
  raw_text text not null,
  summary_title text,
  entry_type text not null default 'food'
    check (entry_type in ('food', 'activity', 'mixed', 'quick_check')),
  time_slot text not null default 'anytime'
    check (time_slot in ('morning', 'lunch', 'snack', 'evening', 'anytime')),
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'done', 'error')),
  error_message text,
  ai_notes text,
  meal_template_id bigint references public.meal_templates(id) on delete set null,
  total_intake_kcal integer not null default 0,
  total_burned_kcal integer not null default 0,
  total_protein_g numeric(6,1) not null default 0,
  total_carbs_g numeric(6,1) not null default 0,
  total_fat_g numeric(6,1) not null default 0,
  total_fiber_g numeric(6,1) not null default 0,
  logged_at timestamptz not null default now(),
  processed_at timestamptz
);

create index log_entries_user_date_idx on public.log_entries (user_id, log_date desc, logged_at desc);
create index log_entries_meal_template_id_idx on public.log_entries (meal_template_id);

create table public.entry_items (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  log_entry_id bigint not null references public.log_entries(id) on delete cascade,
  item_kind text not null check (item_kind in ('food', 'activity')),
  item_name text not null,
  canonical_name text not null,
  portion_grams integer,
  duration_minutes integer,
  met_value numeric(4,1),
  kcal integer not null default 0 check (kcal >= 0),
  burned_kcal integer not null default 0 check (burned_kcal >= 0),
  protein_g numeric(6,1) not null default 0 check (protein_g >= 0),
  carbs_g numeric(6,1) not null default 0 check (carbs_g >= 0),
  fat_g numeric(6,1) not null default 0 check (fat_g >= 0),
  fiber_g numeric(6,1) not null default 0 check (fiber_g >= 0),
  confidence numeric(3,2) not null default 0.85 check (confidence between 0 and 1),
  created_at timestamptz not null default now()
);

create index entry_items_user_id_idx on public.entry_items (user_id);
create index entry_items_log_entry_id_idx on public.entry_items (log_entry_id);
