CREATE TABLE public.user_ui_preferences (
    user_id text PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
    created_at timestamp DEFAULT now() NOT NULL,
    updated_at timestamp DEFAULT now() NOT NULL,
    theme_mode text DEFAULT 'system' NOT NULL,
    accent_color text DEFAULT 'teal' NOT NULL,
    density text DEFAULT 'comfortable' NOT NULL,
    font_family text DEFAULT 'inter' NOT NULL,
    font_size text DEFAULT 'md' NOT NULL,
    radius text DEFAULT 'md' NOT NULL,
    CONSTRAINT user_ui_preferences_theme_mode_check CHECK (theme_mode IN ('system', 'light', 'dark')),
    CONSTRAINT user_ui_preferences_accent_color_check CHECK (accent_color IN ('gray', 'orange', 'yellow', 'green', 'teal', 'blue', 'cyan', 'purple', 'pink')),
    CONSTRAINT user_ui_preferences_density_check CHECK (density IN ('compact', 'comfortable', 'relaxed')),
    CONSTRAINT user_ui_preferences_font_family_check CHECK (font_family IN ('inter', 'manrope', 'space-grotesk')),
    CONSTRAINT user_ui_preferences_font_size_check CHECK (font_size IN ('sm', 'md', 'lg', 'xl', '2xl')),
    CONSTRAINT user_ui_preferences_radius_check CHECK (radius IN ('none', 'sm', 'md', 'lg', 'xl'))
);
