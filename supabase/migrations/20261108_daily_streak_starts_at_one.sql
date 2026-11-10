UPDATE public."User"
SET streak = 1
WHERE streak IS NULL
   OR (streak = 0 AND last_active::date = (pg_catalog.now() AT TIME ZONE 'UTC')::date);

ALTER TABLE public."User"
    ALTER COLUMN streak SET DEFAULT 1;

CREATE OR REPLACE FUNCTION public.record_user_activity() RETURNS bigint
    LANGUAGE plpgsql SECURITY INVOKER
    SET search_path TO ''
    AS $$
DECLARE
  utc_today date := (pg_catalog.now() AT TIME ZONE 'UTC')::date;
  updated_streak bigint;
BEGIN
  UPDATE public."User" AS profile
  SET streak = CASE
    WHEN profile.last_active IS NULL THEN 1
    WHEN profile.last_active::date = utc_today THEN COALESCE(profile.streak, 1)
    WHEN profile.last_active::date = utc_today - 1 THEN COALESCE(profile.streak, 1) + 1
    ELSE 1
  END,
  last_active = utc_today::timestamp
  WHERE profile.user_id = auth.uid()
  RETURNING profile.streak INTO updated_streak;

  RETURN updated_streak;
END;
$$;

REVOKE ALL ON FUNCTION public.record_user_activity() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_user_activity() TO authenticated;