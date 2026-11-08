-- Add shortcut_aliases and preset_notes to meal_templates for personal meal shortcuts
alter table public.meal_templates
  add column if not exists shortcut_aliases text[] not null default '{}'::text[],
  add column if not exists preset_notes text;

create unique index if not exists meal_templates_user_canonical_unique_idx
  on public.meal_templates (user_id, lower(canonical_name));
