-- Add optional target weight goal for motivational weight chart
alter table public.user_profiles
  add column if not exists target_weight_kg numeric(5, 1)
  check (target_weight_kg is null or (target_weight_kg >= 35 and target_weight_kg <= 260));
