import { useState } from 'react';
import { Box, Text } from '@chakra-ui/react';
import { Globe2, Palette, SlidersHorizontal } from 'lucide-react';
import { AppearancePreferencesControls } from '@/components/navigation/theme-toggle';
import { useAccentColor } from '@/components/providers/accent-color-context';
import type { PreferenceDateFormat } from '@/components/providers/accent-color-context';
import { Switch } from '@/components/ui/switch';
import { AnswerModePicker } from '@/features/chat/components/answer-mode-picker';
import { formatBrowserTimeZone } from '@/lib/localization';
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

const dateFormatOptions = [
  { value: 'auto', label: 'Automatic' },
  { value: 'DD.MM.YYYY', label: 'DD.MM.YYYY' },
  { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY' },
  { value: 'DD-MM-YYYY', label: 'DD-MM-YYYY' },
  { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY' },
  { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD' },
  { value: 'YYYY/MM/DD', label: 'YYYY/MM/DD' },
];

const defaultViewOptions = [
  { value: 'list', label: 'List' },
  { value: 'grid', label: 'Grid' },
];

export function PreferencesSettingsPage() {
  const {
    language,
    dateFormat,
    defaultFileBrowserView,
    defaultChatAnswerMode,
    setLanguage,
    setDateFormat,
    setDefaultFileBrowserView,
    setDefaultChatAnswerMode,
    showExtractedTextTab,
    setShowExtractedTextTab,
  } = useAccentColor();
  const [browserTimeZone] = useState(formatBrowserTimeZone);

  return (
    <SettingsPageFrame
      title="Preferences"
      description="Customize how Arkivra works for you."
      density="compact"
    >
      <SettingsFlatRows>
        <SettingsFlatRow
          title="Regional"
          description="Set your language and date format. Timezone is handled automatically."
          icon={<Globe2 size={21} strokeWidth={1.8} />}
          iconBg="teal.subtle"
          iconColor="teal.fg"
        >
          <SettingsRows density="compact">
            <SettingsRow
              density="compact"
              label="Language"
              description="Choose the language used throughout the Arkivra interface."
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
              description="Automatically detected from your browser."
              control={
                <Box
                  minH="var(--arkivra-controlHeight, 2.5rem)"
                  display="flex"
                  alignItems="center"
                  justifyContent={{ base: 'flex-start', lg: 'flex-end' }}
                  textAlign={{ base: 'left', lg: 'right' }}
                  maxW="full"
                >
                  <Text fontSize="sm" fontWeight="medium" color="fg" wordBreak="break-word">
                    {browserTimeZone}
                  </Text>
                </Box>
              }
            />
            <SettingsRow
              density="compact"
              label="Date format"
              description="Use automatic local formatting or choose a date pattern."
              control={
                <SettingsDropdown
                  ariaLabel="Date format"
                  options={dateFormatOptions}
                  value={dateFormat ?? 'auto'}
                  onValueChange={(value) => {
                    setDateFormat(value === 'auto' ? null : value as PreferenceDateFormat);
                  }}
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
