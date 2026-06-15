ALTER TABLE public.user_ui_preferences
  ADD COLUMN default_chat_answer_mode text DEFAULT 'text' NOT NULL;

ALTER TABLE public.user_ui_preferences
  ADD CONSTRAINT user_ui_preferences_default_chat_answer_mode_check
  CHECK (default_chat_answer_mode IN ('text', 'multimodal'));
