-- Create body_measurements table for tracking weight (kg) and waist circumference (cm) over time
create table public.body_measurements (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  measured_date date not null,
  weight_kg numeric(5,1) check (weight_kg is null or (weight_kg between 30 and 300)),
  waist_cm numeric(5,1) check (waist_cm is null or (waist_cm between 40 and 200)),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint body_measurements_has_metric_check check (weight_kg is not null or waist_cm is not null),
  constraint body_measurements_user_date_unique unique (user_id, measured_date)
);

create index body_measurements_user_date_idx
  on public.body_measurements (user_id, measured_date desc);

grant select, insert, update, delete on public.body_measurements to authenticated;
grant usage, select on all sequences in schema public to authenticated;

alter table public.body_measurements enable row level security;

create policy "body_measurements_select_own" on public.body_measurements
  for select to authenticated
  using ((select auth.uid()) = user_id and (select public.is_owner_user()));

create policy "body_measurements_insert_own" on public.body_measurements
  for insert to authenticated
  with check ((select auth.uid()) = user_id and (select public.is_owner_user()));

create policy "body_measurements_update_own" on public.body_measurements
  for update to authenticated
  using ((select auth.uid()) = user_id and (select public.is_owner_user()))
  with check ((select auth.uid()) = user_id and (select public.is_owner_user()));

create policy "body_measurements_delete_own" on public.body_measurements
  for delete to authenticated
  using ((select auth.uid()) = user_id and (select public.is_owner_user()));

alter publication supabase_realtime add table public.body_measurements;
