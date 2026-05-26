import type { Translator } from './i18n/i18n';
import { useI18n } from './i18n/i18n';

export const GITHUB_REPO_URL = 'https://github.com/Jasnan/Arkivra';
export const GITHUB_ISSUES_URL = `${GITHUB_REPO_URL}/issues`;
export const DISCORD_INVITE_URL = GITHUB_REPO_URL;

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
      inHeader: true,
    },
  ];
}
