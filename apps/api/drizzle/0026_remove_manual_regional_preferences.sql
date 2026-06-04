ALTER TABLE public.user_ui_preferences
  DROP CONSTRAINT IF EXISTS user_ui_preferences_timezone_check,
  DROP CONSTRAINT IF EXISTS user_ui_preferences_date_format_check;

ALTER TABLE public.user_ui_preferences
  DROP COLUMN IF EXISTS timezone;

ALTER TABLE public.user_ui_preferences
  ALTER COLUMN date_format DROP DEFAULT,
  ALTER COLUMN date_format DROP NOT NULL;

UPDATE public.user_ui_preferences
SET date_format = NULL
WHERE date_format IS NOT NULL;

ALTER TABLE public.user_ui_preferences
  ADD CONSTRAINT user_ui_preferences_date_format_check
  CHECK (date_format IN ('DD.MM.YYYY', 'DD/MM/YYYY', 'DD-MM-YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD', 'YYYY/MM/DD'));
