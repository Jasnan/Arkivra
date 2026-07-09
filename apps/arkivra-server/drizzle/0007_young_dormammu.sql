ALTER TABLE "user_ui_preferences" ADD COLUMN "appearance_preferences" jsonb DEFAULT '{"themeMode":"system","selectedTheme":"default","selectedTweakcnTheme":"","selectedRadius":"0.5rem","brandColors":{},"sidebar":{"variant":"inset","collapsible":"offcanvas","side":"left"}}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "user_ui_preferences" DROP COLUMN "accent_color";--> statement-breakpoint
ALTER TABLE "user_ui_preferences" DROP COLUMN "density";--> statement-breakpoint
ALTER TABLE "user_ui_preferences" DROP COLUMN "font_family";--> statement-breakpoint
ALTER TABLE "user_ui_preferences" DROP COLUMN "font_size";--> statement-breakpoint
ALTER TABLE "user_ui_preferences" DROP COLUMN "radius";--> statement-breakpoint
ALTER TABLE "user_ui_preferences" DROP COLUMN "language";--> statement-breakpoint
ALTER TABLE "user_ui_preferences" DROP COLUMN "date_format";--> statement-breakpoint
ALTER TABLE "user_ui_preferences" DROP COLUMN "show_extracted_text_tab";--> statement-breakpoint
ALTER TABLE "user_ui_preferences" DROP COLUMN "default_file_browser_view";--> statement-breakpoint
ALTER TABLE "user_ui_preferences" DROP COLUMN "default_chat_answer_mode";