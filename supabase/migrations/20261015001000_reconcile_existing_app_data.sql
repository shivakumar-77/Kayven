-- Add fields expected by the app-data migration to tables that may already exist
-- from earlier manual setup. Defaults backfill existing rows without replacing data.
alter table public.achievements
  add column if not exists earned_at timestamptz;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'achievements'
      and column_name = 'achieved_at'
  ) then
    execute 'update public.achievements set earned_at = coalesce(achieved_at, now()) where earned_at is null';
  else
    update public.achievements set earned_at = now() where earned_at is null;
  end if;
end
$$;

alter table public.achievements
  alter column earned_at set default now(),
  alter column earned_at set not null;

create unique index if not exists idx_exercise_prs_user_exercise_unique
  on public.exercise_prs (user_id, exercise_id);

alter table public.streaks
  add column if not exists updated_at timestamptz not null default now();

alter table public.supplements
  add column if not exists updated_at timestamptz;

update public.supplements
set updated_at = coalesce(created_at, now())
where updated_at is null;

alter table public.supplements
  alter column updated_at set default now(),
  alter column updated_at set not null;

alter table public.workout_logs
  add column if not exists created_at timestamptz;

update public.workout_logs
set created_at = coalesce(started_at, now())
where created_at is null;

alter table public.workout_logs
  alter column created_at set default now(),
  alter column created_at set not null;

alter table public.workout_templates
  add column if not exists updated_at timestamptz;

update public.workout_templates
set updated_at = coalesce(created_at, now())
where updated_at is null;

alter table public.workout_templates
  alter column updated_at set default now(),
  alter column updated_at set not null;

create unique index if not exists idx_supplements_id_user_id
  on public.supplements (id, user_id);

do $$
begin
  if to_regclass('public.supplement_logs') is not null
  then
    if not exists (
      select 1
      from pg_constraint
      where conrelid = to_regclass('public.supplement_logs')
        and conname = 'supplement_logs_supplement_user_fkey'
    ) then
      alter table public.supplement_logs
        add constraint supplement_logs_supplement_user_fkey
        foreign key (supplement_id, user_id)
        references public.supplements (id, user_id)
        on delete cascade
        not valid;
    end if;
  end if;
end
$$;
