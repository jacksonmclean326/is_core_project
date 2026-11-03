ALTER TABLE public."User"
    ADD COLUMN IF NOT EXISTS daily_sync boolean,
    ADD COLUMN IF NOT EXISTS budget_reminders boolean,
    ADD COLUMN IF NOT EXISTS leaderboard_visibility boolean;

UPDATE public."User"
SET daily_sync = true
WHERE daily_sync IS NULL;

UPDATE public."User"
SET budget_reminders = true
WHERE budget_reminders IS NULL;

UPDATE public."User"
SET leaderboard_visibility = true
WHERE leaderboard_visibility IS NULL;

ALTER TABLE public."User"
    ALTER COLUMN daily_sync SET DEFAULT true,
    ALTER COLUMN daily_sync SET NOT NULL,
    ALTER COLUMN budget_reminders SET DEFAULT true,
    ALTER COLUMN budget_reminders SET NOT NULL,
    ALTER COLUMN leaderboard_visibility SET DEFAULT true,
    ALTER COLUMN leaderboard_visibility SET NOT NULL;