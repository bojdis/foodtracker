-- Enable multi-user profiles by removing the singleton lock on user_profiles
alter table public.user_profiles
  drop constraint if exists user_profiles_singleton_unique,
  drop constraint if exists user_profiles_singleton_true;

alter table public.user_profiles
  drop column if exists singleton_lock;

alter table public.user_profiles
  alter column display_name set default 'Uživatel';

drop function if exists public.is_tracker_initialized();
