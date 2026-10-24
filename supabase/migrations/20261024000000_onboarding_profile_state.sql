-- Add durable onboarding progress and completion without changing existing profile access policies.
alter table public.profiles
  add column if not exists current_weight_kg numeric(5,2)
    check (current_weight_kg is null or current_weight_kg between 25 and 300),
  add column if not exists onboarding_data jsonb not null default '{}'::jsonb,
  add column if not exists onboarding_completed_at timestamptz;

-- The legacy onboarding saved age and height only when its final submit completed.
-- Preserve returning users by marking those existing completed profiles as complete.
update public.profiles
set onboarding_completed_at = coalesce(created_at, now())
where onboarding_completed_at is null
  and age is not null
  and height is not null;
