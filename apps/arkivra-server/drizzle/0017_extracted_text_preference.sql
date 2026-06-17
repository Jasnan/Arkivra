ALTER TABLE public.user_ui_preferences
  ADD COLUMN show_extracted_text_tab boolean DEFAULT false NOT NULL;

ALTER TABLE public.user_ui_preferences
  ADD COLUMN default_file_browser_view text DEFAULT 'list' NOT NULL;

ALTER TABLE public.user_ui_preferences
  ADD CONSTRAINT user_ui_preferences_default_file_browser_view_check
  CHECK (default_file_browser_view IN ('list', 'grid'));
