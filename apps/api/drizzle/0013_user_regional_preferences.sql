ALTER TABLE public.user_ui_preferences
  ADD COLUMN IF NOT EXISTS language text DEFAULT 'en' NOT NULL,
  ADD COLUMN IF NOT EXISTS timezone text DEFAULT 'auto' NOT NULL,
  ADD COLUMN IF NOT EXISTS date_format text DEFAULT 'medium' NOT NULL;

ALTER TABLE public.user_ui_preferences
  ADD CONSTRAINT user_ui_preferences_language_check CHECK (language IN ('en', 'de', 'fr')),
  ADD CONSTRAINT user_ui_preferences_timezone_check CHECK (timezone IN ('auto', 'utc', 'europe-berlin', 'america-new-york')),
  ADD CONSTRAINT user_ui_preferences_date_format_check CHECK (date_format IN ('medium', 'numeric', 'short'));
