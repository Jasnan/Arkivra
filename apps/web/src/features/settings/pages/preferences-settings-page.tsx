import { Heading, Stack, Text } from '@chakra-ui/react';
import { useState } from 'react';
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
  const [language, setLanguage] = useState('en');
  const [timezone, setTimezone] = useState('auto');
  const [dateFormat, setDateFormat] = useState('medium');
  const [defaultView, setDefaultView] = useState('list');
  const [defaultChatAnswerMode, setDefaultChatAnswerMode] = useState<ChatResponseMode>('text');

  return (
    <SettingsPageFrame title="Preferences">
      <SettingsSection title="Preferences" description="Set regional formatting, document view, and chat answer defaults.">
        <Stack gap="5">
          <Stack gap="3">
            <Stack gap="1">
              <Heading as="h3" fontSize="sm" fontWeight="semibold" lineHeight="short">
                Regional
              </Heading>
              <Text textStyle="sm" color="fg.muted">
                Choose how dates, language, and time zones appear across Arkivra.
              </Text>
            </Stack>
            <SettingsRows>
              <SettingsRow
                label="Language"
                description="Language used for the app interface."
                control={
                  <SettingsDropdown
                    ariaLabel="Language"
                    options={languageOptions}
                    value={language}
                    onValueChange={setLanguage}
                  />
                }
              />
              <SettingsRow
                label="Timezone"
                description="Timezone used for document and activity timestamps."
                control={
                  <SettingsDropdown
                    ariaLabel="Timezone"
                    options={timezoneOptions}
                    value={timezone}
                    onValueChange={setTimezone}
                  />
                }
              />
              <SettingsRow
                label="Date format"
                description="Date style used in tables and metadata panels."
                control={
                  <SettingsDropdown
                    ariaLabel="Date format"
                    options={dateFormatOptions}
                    value={dateFormat}
                    onValueChange={setDateFormat}
                  />
                }
              />
            </SettingsRows>
          </Stack>

          <Separator />

          <Stack gap="3">
            <Stack gap="1">
              <Heading as="h3" fontSize="sm" fontWeight="semibold" lineHeight="short">
                Defaults
              </Heading>
              <Text textStyle="sm" color="fg.muted">
                Choose the starting layout and answer style for everyday workflows.
              </Text>
            </Stack>
            <SettingsRows>
              <SettingsRow
                label="Default view"
                description="Initial layout for document browsing."
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
                label="Default chat answer mode"
                description="Answer style used when starting a new chat."
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
