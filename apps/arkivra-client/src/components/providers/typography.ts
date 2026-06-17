export type AppearanceFont = 'inter' | 'sora' | 'space-grotesk';

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
    value: 'sora',
    label: 'Sora',
    description: 'Modern geometric UI typeface.',
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

export function normalizeAppearanceFont(value: string | null): AppearanceFont | null {
  if (value === 'manrope') return 'sora';
  return isAppearanceFont(value) ? value : null;
}
