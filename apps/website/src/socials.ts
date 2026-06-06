import type { Translator } from './i18n/i18n.ts';
import { useI18n } from './i18n/i18n.ts';

export const GITHUB_REPO_URL = 'https://github.com/Jasnan/Arkivra';
export const GITHUB_ISSUES_URL = `${GITHUB_REPO_URL}/issues`;

export function getSocials({
  t = useI18n().t,
}: {
  t?: Translator;
} = {}) {
  return [
    {
      id: 'github',
      name: t('socials.github.name'),
      label: t('socials.github.label'),
      url: GITHUB_REPO_URL,
      icon: 'i-tabler-brand-github',
      inHeader: false,
      isAvailable: false,
    },
  ];
}
