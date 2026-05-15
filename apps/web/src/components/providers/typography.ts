export const LEGACY_FONT_FAMILY_STORAGE_KEY = 'arkivra.fontFamily';

export type AppearanceFont = 'inter' | 'manrope' | 'space-grotesk';

export interface TypographyOption {
  description: string;
  label: string;
  sample: string;
  value: AppearanceFont;
}

export const typographyOptions = [
  {
    value: 'inter',
    label: 'Inter',
    description: 'Default balanced UI typeface.',
    sample: 'Aa',
  },
  {
    value: 'manrope',
    label: 'Manrope',
    description: 'Clean dashboard typeface with open forms.',
    sample: 'Aa',
  },
  {
    value: 'space-grotesk',
    label: 'Space Grotesk',
    description: 'Expressive technical character.',
    sample: 'Aa',
  },
] satisfies TypographyOption[];

export const defaultTypographyFont: AppearanceFont = 'inter';

export function isAppearanceFont(value: string | null): value is AppearanceFont {
  return typographyOptions.some((option) => option.value === value);
}
