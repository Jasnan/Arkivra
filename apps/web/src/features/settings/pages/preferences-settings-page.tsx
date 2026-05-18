import { Heading, Stack } from '@chakra-ui/react';
import { useState } from 'react';
import { useAccentColor } from '@/components/providers/accent-color-context';
import { Separator } from '@/components/ui/separator';
import type { ChatResponseMode } from '@/features/chat/chat.api';
import { AnswerModePicker } from '@/features/chat/components/answer-mode-picker';
import {
  SettingsDropdown,
  SettingsPageFrame,
  SettingsRow,
  SettingsRows,
  SettingsSection,
} from '../components/settings-ui';

const languageOptions = [
  { value: 'en', label: 'English' },
  { value: 'de', label: 'German' },
  { value: 'fr', label: 'French' },
];

const timezoneOptions = [
  { value: 'auto', label: 'Automatic' },
  { value: 'utc', label: 'UTC' },
  { value: 'europe-berlin', label: 'Europe/Berlin' },
  { value: 'america-new-york', label: 'America/New York' },
];

const dateFormatOptions = [
  { value: 'medium', label: 'May 15, 2026' },
  { value: 'numeric', label: '2026-05-15' },
  { value: 'short', label: '15 May 2026' },
];

const defaultViewOptions = [
  { value: 'list', label: 'List' },
  { value: 'grid', label: 'Grid' },
];

export function PreferencesSettingsPage() {
  const {
    language,
    timezone,
    dateFormat,
    setLanguage,
    setTimezone,
    setDateFormat,
  } = useAccentColor();
  const [defaultView, setDefaultView] = useState('list');
  const [defaultChatAnswerMode, setDefaultChatAnswerMode] = useState<ChatResponseMode>('text');

  return (
    <SettingsPageFrame title="Preferences" density="compact">
      <SettingsSection title="Preferences" density="compact">
        <Stack gap="3.5">
          <Stack gap="2.5">
            <Stack gap="0.5">
              <Heading as="h3" fontSize="sm" fontWeight="semibold" lineHeight="short">
                Regional
              </Heading>
            </Stack>
            <SettingsRows density="compact">
              <SettingsRow
                density="compact"
                label="Language"
                control={
                  <SettingsDropdown
                    ariaLabel="Language"
                    options={languageOptions}
                    value={language}
                    onValueChange={(value) => setLanguage(value as typeof language)}
                  />
                }
              />
              <SettingsRow
                density="compact"
                label="Timezone"
                control={
                  <SettingsDropdown
                    ariaLabel="Timezone"
                    options={timezoneOptions}
                    value={timezone}
                    onValueChange={(value) => setTimezone(value as typeof timezone)}
                  />
                }
              />
              <SettingsRow
                density="compact"
                label="Date format"
                control={
                  <SettingsDropdown
                    ariaLabel="Date format"
                    options={dateFormatOptions}
                    value={dateFormat}
                    onValueChange={(value) => setDateFormat(value as typeof dateFormat)}
                  />
                }
              />
            </SettingsRows>
          </Stack>

          <Separator />

          <Stack gap="2.5">
            <Stack gap="0.5">
              <Heading as="h3" fontSize="sm" fontWeight="semibold" lineHeight="short">
                Defaults
              </Heading>
            </Stack>
            <SettingsRows density="compact">
              <SettingsRow
                density="compact"
                label="Default view"
                control={
                  <SettingsDropdown
                    ariaLabel="Default view"
                    options={defaultViewOptions}
                    value={defaultView}
                    onValueChange={setDefaultView}
                  />
                }
              />
              <SettingsRow
                density="compact"
                label="Default chat answer mode"
                control={
                  <AnswerModePicker
                    value={defaultChatAnswerMode}
                    onValueChange={setDefaultChatAnswerMode}
                    triggerWidth="full"
                  />
                }
              />
            </SettingsRows>
          </Stack>
        </Stack>
      </SettingsSection>
    </SettingsPageFrame>
  );
}
