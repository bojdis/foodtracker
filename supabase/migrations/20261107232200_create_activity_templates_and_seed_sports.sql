-- Create activity_templates for learning recurring sports & quick logging with duration slider + intensity switcher
create table if not exists public.activity_templates (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  canonical_name text not null,
  normalized_signature text not null,
  icon_key text not null default 'activity',
  occurrence_count integer not null default 1 check (occurrence_count >= 1),
  is_quick_check boolean not null default false,
  is_hidden boolean not null default false,
  default_minutes integer not null default 60 check (default_minutes between 5 and 600),
  max_minutes integer not null default 180 check (max_minutes between 60 and 600),
  default_intensity text not null default 'medium'
    check (default_intensity in ('light', 'medium', 'high')),
  met_light numeric(4,1) not null default 3.5 check (met_light > 0),
  met_medium numeric(4,1) not null default 5.0 check (met_medium > 0),
  met_high numeric(4,1) not null default 6.5 check (met_high > 0),
  last_done_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint activity_templates_user_sig_unique unique (user_id, normalized_signature)
);

create index if not exists activity_templates_user_id_idx
  on public.activity_templates (user_id);

create index if not exists activity_templates_quick_check_idx
  on public.activity_templates (user_id, is_quick_check)
  where is_quick_check = true and is_hidden = false;

alter table public.log_entries
  add column if not exists activity_template_id bigint
  references public.activity_templates(id) on delete set null;

create index if not exists log_entries_activity_template_id_idx
  on public.log_entries (activity_template_id);

grant select, insert, update, delete on public.activity_templates to authenticated;
grant usage, select on all sequences in schema public to authenticated;

alter table public.activity_templates enable row level security;

create policy "activity_templates_select_own" on public.activity_templates
  for select to authenticated
  using ((select auth.uid()) = user_id and (select public.is_owner_user()));

create policy "activity_templates_insert_own" on public.activity_templates
  for insert to authenticated
  with check ((select auth.uid()) = user_id and (select public.is_owner_user()));

create policy "activity_templates_update_own" on public.activity_templates
  for update to authenticated
  using ((select auth.uid()) = user_id and (select public.is_owner_user()))
  with check ((select auth.uid()) = user_id and (select public.is_owner_user()));

create policy "activity_templates_delete_own" on public.activity_templates
  for delete to authenticated
  using ((select auth.uid()) = user_id and (select public.is_owner_user()));

alter publication supabase_realtime add table public.activity_templates;

-- Seed Radek's 5 staple sports if profile exists
insert into public.activity_templates (
  user_id,
  canonical_name,
  normalized_signature,
  icon_key,
  occurrence_count,
  is_quick_check,
  default_minutes,
  max_minutes,
  default_intensity,
  met_light,
  met_medium,
  met_high
)
select
  p.user_id,
  s.canonical_name,
  s.normalized_signature,
  s.icon_key,
  s.occurrence_count,
  true,
  s.default_minutes,
  s.max_minutes,
  'medium',
  s.met_light,
  s.met_medium,
  s.met_high
from public.user_profiles p
cross join (
  values
    ('Kolo', 'kol', 'bike', 5, 90, 240, 5.0, 6.5, 8.2),
    ('Lezení', 'lezen', 'climb', 4, 75, 180, 4.2, 5.6, 7.0),
    ('Posilovna', 'posilovn', 'gym', 4, 60, 150, 3.4, 4.5, 5.8),
    ('Bazén', 'bazen', 'swim', 4, 45, 150, 4.8, 6.5, 8.5),
    ('Chůze', 'chuz', 'walk', 4, 45, 240, 2.8, 3.6, 4.8)
) as s(
  canonical_name,
  normalized_signature,
  icon_key,
  occurrence_count,
  default_minutes,
  max_minutes,
  met_light,
  met_medium,
  met_high
)
on conflict (user_id, normalized_signature) do nothing;

-- Link existing cycling log entries to the seeded 'Kolo' activity template
update public.log_entries le
set activity_template_id = at.id
from public.activity_templates at
where le.user_id = at.user_id
  and at.normalized_signature = 'kol'
  and le.activity_template_id is null
  and le.total_burned_kcal > 0
  and le.raw_text ilike '%kolo%';
