import { useState } from 'react';
import { Globe2, Palette, SlidersHorizontal } from 'lucide-react';
import { AppearancePreferencesControls } from '@/components/navigation/theme-toggle';
import { useAccentColor } from '@/components/providers/accent-color-context';
import { Switch } from '@/components/ui/switch';
import type { ChatResponseMode } from '@/features/chat/chat.api';
import { AnswerModePicker } from '@/features/chat/components/answer-mode-picker';
import {
  SettingsDropdown,
  SettingsFlatRow,
  SettingsFlatRows,
  SettingsPageFrame,
  SettingsRow,
  SettingsRows,
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
    defaultFileBrowserView,
    setLanguage,
    setTimezone,
    setDateFormat,
    setDefaultFileBrowserView,
    showExtractedTextTab,
    setShowExtractedTextTab,
  } = useAccentColor();
  const [defaultChatAnswerMode, setDefaultChatAnswerMode] = useState<ChatResponseMode>('text');

  return (
    <SettingsPageFrame
      title="Preferences"
      description="Customize how Arkivra works for you."
      density="compact"
    >
      <SettingsFlatRows>
        <SettingsFlatRow
          title="Regional"
          description="Set your language, timezone, and date format."
          icon={<Globe2 size={21} strokeWidth={1.8} />}
          iconBg="teal.subtle"
          iconColor="teal.fg"
        >
          <SettingsRows density="compact">
            <SettingsRow
              density="compact"
              label="Language"
              description="Choose the language for the Arkivra interface."
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
              description="Set your local timezone."
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
              description="Choose how dates are displayed across Arkivra."
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
        </SettingsFlatRow>

        <SettingsFlatRow
          title="Defaults"
          description="Set your default view and behavior."
          icon={<SlidersHorizontal size={21} strokeWidth={1.8} />}
          iconBg="teal.subtle"
          iconColor="teal.fg"
        >
          <SettingsRows density="compact">
            <SettingsRow
              density="compact"
              label="Default view"
              description="Choose how project contents open before any session changes."
              control={
                <SettingsDropdown
                  ariaLabel="Default view"
                  options={defaultViewOptions}
                  value={defaultFileBrowserView}
                  onValueChange={(value) => setDefaultFileBrowserView(value as typeof defaultFileBrowserView)}
                />
              }
            />
            <SettingsRow
              density="compact"
              label="Extracted text tab"
              description="Show extracted document text in document detail views."
              control={
                <Switch
                  aria-label="Show extracted text tab"
                  checked={showExtractedTextTab}
                  onCheckedChange={setShowExtractedTextTab}
                />
              }
            />
            <SettingsRow
              density="compact"
              label="Default chat answer mode"
              description="Choose how responses are generated in chat."
              control={
                <AnswerModePicker
                  value={defaultChatAnswerMode}
                  onValueChange={setDefaultChatAnswerMode}
                  triggerWidth="full"
                />
              }
            />
          </SettingsRows>
        </SettingsFlatRow>

        <SettingsFlatRow
          title="Appearance"
          description="Customize how Arkivra looks and feels."
          icon={<Palette size={21} strokeWidth={1.8} />}
          iconBg="teal.subtle"
          iconColor="teal.fg"
        >
          <AppearancePreferencesControls />
        </SettingsFlatRow>
      </SettingsFlatRows>
    </SettingsPageFrame>
  );
}
