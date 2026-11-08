-- Add preferred energy unit (kJ / kcal) to user_profiles (default kJ)
-- and unify Radek's Protein preset so standalone Protein without inulin is retired
alter table public.user_profiles
  add column if not exists energy_unit text not null default 'kj'
  check (energy_unit in ('kj', 'kcal'));

update public.user_profiles
set energy_unit = 'kj',
    updated_at = now()
where user_id = 'fa6a2e35-4386-4648-a9c9-bf4bd584400f';

update public.meal_templates
set is_hidden = true,
    is_quick_check = false,
    updated_at = now()
where user_id = 'fa6a2e35-4386-4648-a9c9-bf4bd584400f'
  and canonical_name = 'Protein (shake)';

update public.meal_templates
set shortcut_aliases = array['protein', 'protein + inulin', 'protein s inulinem', 'protein inulin', 'protein shake', 'shake'],
    updated_at = now()
where user_id = 'fa6a2e35-4386-4648-a9c9-bf4bd584400f'
  and canonical_name = 'Protein + inulin';
