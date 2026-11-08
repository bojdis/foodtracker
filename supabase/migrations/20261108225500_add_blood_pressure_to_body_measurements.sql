-- Add blood pressure (SYS/DIA in mmHg) and pulse (BPM) to body_measurements
alter table public.body_measurements
  add column if not exists blood_pressure_sys integer check (blood_pressure_sys is null or (blood_pressure_sys between 60 and 260)),
  add column if not exists blood_pressure_dia integer check (blood_pressure_dia is null or (blood_pressure_dia between 40 and 160)),
  add column if not exists pulse_bpm integer check (pulse_bpm is null or (pulse_bpm between 35 and 220));

-- Update constraint to allow recording BP / pulse even without weight or waist
alter table public.body_measurements
  drop constraint if exists body_measurements_has_metric_check;

alter table public.body_measurements
  add constraint body_measurements_has_metric_check check (
    weight_kg is not null or
    waist_cm is not null or
    blood_pressure_sys is not null or
    blood_pressure_dia is not null or
    pulse_bpm is not null
  );

-- Ensure if one blood pressure component is provided, both SYS and DIA are stored
alter table public.body_measurements
  drop constraint if exists body_measurements_bp_pair_check;

alter table public.body_measurements
  add constraint body_measurements_bp_pair_check check (
    (blood_pressure_sys is null and blood_pressure_dia is null) or
    (blood_pressure_sys is not null and blood_pressure_dia is not null)
  );
