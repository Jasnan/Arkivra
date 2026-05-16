ALTER TABLE public.user_ui_preferences
  DROP CONSTRAINT IF EXISTS user_ui_preferences_font_family_check;

UPDATE public.user_ui_preferences
SET font_family = 'sora'
WHERE font_family = 'manrope';

ALTER TABLE public.user_ui_preferences
  ADD CONSTRAINT user_ui_preferences_font_family_check CHECK (font_family IN ('inter', 'sora', 'space-grotesk'));
