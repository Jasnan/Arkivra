import { Box, Grid, Text } from '@chakra-ui/react';
import { useState } from 'react';
import { useTheme } from 'next-themes';
import { useAccentColor } from '@/components/providers/accent-color-context';
import type { AccentColor, AppearanceDensity } from '@/components/providers/accent-color-context';
import { useVaultsQuery } from '@/features/vaults/vaults.queries';
import {
  SettingsDropdown,
  SettingsPageFrame,
  SettingsRow,
  SettingsRows,
  SettingsSection,
} from '../components/settings-ui';

function isAccentColor(value: string): value is AccentColor {
  return value === 'gray'
    || value === 'red'
    || value === 'orange'
    || value === 'yellow'
    || value === 'green'
    || value === 'teal'
    || value === 'blue'
    || value === 'cyan'
    || value === 'purple'
    || value === 'pink';
}

function isAppearanceDensity(value: string): value is AppearanceDensity {
  return value === 'compact' || value === 'comfortable' || value === 'relaxed';
}

const themeOptions = [
  { value: 'system', label: 'System' },
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
];

const densityOptions = [
  { value: 'compact', label: 'Compact' },
  { value: 'comfortable', label: 'Comfortable' },
  { value: 'relaxed', label: 'Relaxed' },
];

const accentColorOptions = [
  { value: 'gray', label: 'Gray' },
  { value: 'red', label: 'Red' },
  { value: 'orange', label: 'Orange' },
  { value: 'yellow', label: 'Yellow' },
  { value: 'green', label: 'Green' },
  { value: 'teal', label: 'Arkivra teal' },
  { value: 'blue', label: 'Blue' },
  { value: 'cyan', label: 'Cyan' },
  { value: 'purple', label: 'Purple' },
  { value: 'pink', label: 'Pink' },
];

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
  { value: 'compact', label: 'Compact list' },
];

const defaultChatModelOptions = [
  { value: 'instance-default', label: 'Instance default' },
  { value: 'fast', label: 'Fast responses' },
  { value: 'deep', label: 'Deep analysis' },
];

export function PreferencesSettingsPage() {
  const vaultsQuery = useVaultsQuery();
  const vaults = vaultsQuery.data?.vaults ?? [];
  const { setTheme, theme } = useTheme();
  const { accentColor, density, setAccentColor, setDensity } = useAccentColor();

  const [language, setLanguage] = useState('en');
  const [timezone, setTimezone] = useState('auto');
  const [dateFormat, setDateFormat] = useState('medium');
  const [defaultVault, setDefaultVault] = useState('__none__');
  const [defaultView, setDefaultView] = useState('list');
  const [defaultChatModel, setDefaultChatModel] = useState('instance-default');
  const defaultVaultOptions = [
    { value: '__none__', label: 'No default' },
    ...vaults.map((vault) => ({ value: vault.id, label: vault.name })),
  ];

  return (
    <SettingsPageFrame title="Preferences">
      <Grid gap="4" templateColumns={{ base: '1fr', xl: 'repeat(2, minmax(0, 1fr))' }} alignItems="start">
        <SettingsSection title="Appearance" description="Control the interface style used in Arkivra.">
          <SettingsRows>
            <SettingsRow
              label="Theme"
              description="Choose how the app follows your display mode."
              control={
                <SettingsDropdown
                  ariaLabel="Theme"
                  options={themeOptions}
                  value={theme ?? 'system'}
                  onValueChange={setTheme}
                />
              }
            />
            <SettingsRow
              label="Density"
              description="Adjust spacing for content-heavy workflows."
              control={
                <SettingsDropdown
                  ariaLabel="Density"
                  options={densityOptions}
                  value={density}
                  onValueChange={(value) => {
                    if (isAppearanceDensity(value)) {
                      setDensity(value);
                    }
                  }}
                />
              }
            />
            <SettingsRow
              label="Accent color"
              description="Select the primary action color."
              control={
                <SettingsDropdown
                  ariaLabel="Accent color"
                  options={accentColorOptions}
                  value={accentColor}
                  onValueChange={(value) => {
                    if (isAccentColor(value)) {
                      setAccentColor(value);
                    }
                  }}
                />
              }
            />
          </SettingsRows>
        </SettingsSection>

        <SettingsSection title="Regional" description="Set language, timezone, and date display preferences.">
          <SettingsRows>
            <SettingsRow
              label="Language"
              description="Interface language."
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
              description="Used for document and activity timestamps."
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
              description="Controls dates in tables and metadata panels."
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
        </SettingsSection>

        <SettingsSection title="Defaults" description="Choose starting points for vault, library, and chat workflows.">
          <SettingsRows>
            <SettingsRow
              label="Default vault"
              description="Preferred vault when opening upload and search workflows."
              control={
                <SettingsDropdown
                  ariaLabel="Default vault"
                  options={defaultVaultOptions}
                  value={defaultVault}
                  onValueChange={setDefaultVault}
                />
              }
            />
            <SettingsRow
              label="Default view"
              description="Initial document browser layout."
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
              label="Default chat model"
              description="Preferred model for new chat sessions."
              control={
                <SettingsDropdown
                  ariaLabel="Default chat model"
                  options={defaultChatModelOptions}
                  value={defaultChatModel}
                  onValueChange={setDefaultChatModel}
                />
              }
            />
          </SettingsRows>
        </SettingsSection>
      </Grid>
      <Box rounded="md" borderWidth="1px" borderColor="border.subtle" bg="bg.subtle" px="3.5" py="3">
        <Text textStyle="sm" color="fg.muted">
          Theme applies immediately and is stored by the browser. The remaining controls are prepared for the settings model and currently stay local to this screen.
        </Text>
      </Box>
    </SettingsPageFrame>
  );
}
