'use client';

import * as React from 'react';
import { Globe2, Layout, Palette, RotateCcw } from 'lucide-react';

import { BaseLayout } from '@/components/layouts/base-layout';
import { LayoutTab } from '@/components/theme-customizer/layout-tab';
import { ThemeTab } from '@/components/theme-customizer/theme-tab';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { tweakcnThemes } from '@/config/theme-data';
import { useSidebarConfig } from '@/contexts/sidebar-context';
import { useThemeManager } from '@/hooks/use-theme-manager';
import { authClient } from '@/lib/auth-client';
import {
  DEFAULT_APPEARANCE_PREFERENCES,
  getAppearanceUserKey,
  getServerAppearancePreferences,
  readAppearancePreferences,
  saveServerAppearancePreferences,
  updateAppearancePreferences,
  writeAppearancePreferences,
  type AppearancePreferences,
} from '@/lib/appearance-preferences';
import {
  DEFAULT_REGIONAL_PREFERENCES,
  getServerRegionalPreferences,
  readRegionalPreferences,
  saveServerRegionalPreferences,
  updateRegionalPreferences,
  writeRegionalPreferences,
  type PreferenceDateFormat,
  type RegionalPreferences,
} from '@/lib/regional-preferences';

const languageOptions = [
  { value: 'en', label: 'English' },
] as const;

const dateFormatOptions = [
  { value: 'auto', label: 'Automatic' },
  { value: 'DD.MM.YYYY', label: 'DD.MM.YYYY' },
  { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY' },
  { value: 'DD-MM-YYYY', label: 'DD-MM-YYYY' },
  { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY' },
  { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD' },
  { value: 'YYYY/MM/DD', label: 'YYYY/MM/DD' },
] as const;

function formatBrowserTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Detected from browser';
  } catch {
    return 'Detected from browser';
  }
}

export default function PreferencesSettingsPage() {
  const {
    applyRadius,
    applyTheme,
    applyTweakcnTheme,
    brandColorsValues,
    handleColorChange,
    isDarkMode,
    resetTheme,
    setBrandColorsValues,
    setTheme,
  } = useThemeManager();
  const { config: sidebarConfig, updateConfig: updateSidebarConfig } = useSidebarConfig();
  const { data: sessionData } = authClient.useSession();
  const userKey = React.useMemo(
    () => getAppearanceUserKey(sessionData?.user),
    [sessionData?.user],
  );
  const [regionalPreferences, setRegionalPreferences] = React.useState<RegionalPreferences>(
    DEFAULT_REGIONAL_PREFERENCES,
  );
  const [selectedTheme, setSelectedTheme] = React.useState(
    DEFAULT_APPEARANCE_PREFERENCES.selectedTheme,
  );
  const [selectedTweakcnTheme, setSelectedTweakcnTheme] = React.useState(
    DEFAULT_APPEARANCE_PREFERENCES.selectedTweakcnTheme,
  );
  const [selectedRadius, setSelectedRadius] = React.useState(
    DEFAULT_APPEARANCE_PREFERENCES.selectedRadius,
  );
  const [browserTimeZone] = React.useState(formatBrowserTimeZone);
  const regionalLocalRevisionRef = React.useRef(0);
  const regionalServerSaveQueueRef = React.useRef<Promise<unknown>>(Promise.resolve());
  const appearanceLocalRevisionRef = React.useRef(0);
  const appearanceServerSaveQueueRef = React.useRef<Promise<unknown>>(Promise.resolve());

  const persistAppearancePreferences = React.useCallback(
    (patch: Partial<AppearancePreferences>, options?: { notify?: boolean }) => {
      if (!userKey) return DEFAULT_APPEARANCE_PREFERENCES;

      appearanceLocalRevisionRef.current += 1;
      const preferences = updateAppearancePreferences(userKey, patch, options);
      appearanceServerSaveQueueRef.current = appearanceServerSaveQueueRef.current
        .catch(() => undefined)
        .then(() => saveServerAppearancePreferences(preferences).catch(() => undefined));

      return preferences;
    },
    [userKey],
  );

  const persistRegionalPreferences = React.useCallback(
    (patch: Partial<RegionalPreferences>) => {
      if (!userKey) return DEFAULT_REGIONAL_PREFERENCES;

      regionalLocalRevisionRef.current += 1;
      const nextPreferences = updateRegionalPreferences(userKey, patch);
      setRegionalPreferences(nextPreferences);
      regionalServerSaveQueueRef.current = regionalServerSaveQueueRef.current
        .catch(() => undefined)
        .then(() => saveServerRegionalPreferences(nextPreferences).catch(() => undefined));

      return nextPreferences;
    },
    [userKey],
  );

  function handleResetAppearance() {
    setSelectedTheme(DEFAULT_APPEARANCE_PREFERENCES.selectedTheme);
    setSelectedTweakcnTheme(DEFAULT_APPEARANCE_PREFERENCES.selectedTweakcnTheme);
    setSelectedRadius(DEFAULT_APPEARANCE_PREFERENCES.selectedRadius);
    setBrandColorsValues({});
    resetTheme();
    applyRadius(DEFAULT_APPEARANCE_PREFERENCES.selectedRadius);
    setTheme(DEFAULT_APPEARANCE_PREFERENCES.themeMode);
    updateSidebarConfig(DEFAULT_APPEARANCE_PREFERENCES.sidebar);
    persistAppearancePreferences(DEFAULT_APPEARANCE_PREFERENCES);
  }

  const applyStoredAppearancePreferences = React.useCallback(
    (preferences: AppearancePreferences) => {
      setSelectedTheme(preferences.selectedTheme);
      setSelectedTweakcnTheme(preferences.selectedTweakcnTheme);
      setSelectedRadius(preferences.selectedRadius);
      setBrandColorsValues(preferences.brandColors);
      setTheme(preferences.themeMode);
      applyRadius(preferences.selectedRadius);
      updateSidebarConfig(preferences.sidebar);
    },
    [applyRadius, setBrandColorsValues, setTheme, updateSidebarConfig],
  );

  React.useEffect(() => {
    if (!userKey) return;

    let ignore = false;
    const requestRevision = appearanceLocalRevisionRef.current;

    applyStoredAppearancePreferences(readAppearancePreferences(userKey));

    getServerAppearancePreferences()
      .then((serverPreferences) => {
        if (ignore || appearanceLocalRevisionRef.current !== requestRevision) return;

        const cachedPreferences = writeAppearancePreferences(userKey, serverPreferences);
        applyStoredAppearancePreferences(cachedPreferences);
      })
      .catch(() => undefined);

    return () => {
      ignore = true;
    };
  }, [userKey, applyStoredAppearancePreferences]);

  React.useEffect(() => {
    if (selectedTheme) {
      applyTheme(selectedTheme, isDarkMode);
      return;
    }

    if (selectedTweakcnTheme) {
      const selectedPreset = tweakcnThemes.find(
        (theme) => theme.value === selectedTweakcnTheme,
      )?.preset;
      if (selectedPreset) {
        applyTweakcnTheme(selectedPreset, isDarkMode);
      }
    }
  }, [applyTheme, applyTweakcnTheme, isDarkMode, selectedTheme, selectedTweakcnTheme]);

  React.useEffect(() => {
    applyRadius(selectedRadius);
  }, [applyRadius, isDarkMode, selectedRadius, selectedTheme, selectedTweakcnTheme]);

  React.useEffect(() => {
    Object.entries(brandColorsValues).forEach(([cssVar, value]) => {
      document.documentElement.style.setProperty(cssVar, value);
    });
  }, [brandColorsValues]);

  React.useEffect(() => {
    if (!userKey) {
      setRegionalPreferences(DEFAULT_REGIONAL_PREFERENCES);
      return;
    }

    let ignore = false;
    const requestRevision = regionalLocalRevisionRef.current;

    setRegionalPreferences(readRegionalPreferences(userKey));

    getServerRegionalPreferences()
      .then((serverPreferences) => {
        if (ignore || regionalLocalRevisionRef.current !== requestRevision) return;

        const cachedPreferences = writeRegionalPreferences(userKey, serverPreferences);
        setRegionalPreferences(cachedPreferences);
      })
      .catch(() => undefined);

    return () => {
      ignore = true;
    };
  }, [userKey]);

  return (
    <BaseLayout>
      <div className="space-y-6 px-4 lg:px-6">
        <header className="border-b pb-4">
          <div className="space-y-1.5">
            <h1 className="text-3xl font-bold tracking-tight">Preferences</h1>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Manage regional, theme, and layout preferences.
            </p>
          </div>
        </header>

        <Card className="max-w-4xl rounded-md">
          <CardHeader>
            <div className="flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-md border bg-muted text-muted-foreground">
                <Globe2 className="size-5" />
              </div>
              <div className="min-w-0 space-y-1">
                <CardTitle>Regional</CardTitle>
                <CardDescription>
                  Choose language and date formatting. Timezone follows your browser.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(220px,280px)] sm:items-center">
              <div className="space-y-1">
                <Label htmlFor="preference-language">Language</Label>
                <p className="text-sm text-muted-foreground">
                  English is currently the only supported interface language.
                </p>
              </div>
              <Select
                value={regionalPreferences.language}
                onValueChange={(value) =>
                  persistRegionalPreferences({ language: value as RegionalPreferences['language'] })
                }
              >
                <SelectTrigger id="preference-language" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {languageOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(220px,280px)] sm:items-center">
              <div className="space-y-1">
                <Label>Timezone</Label>
                <p className="text-sm text-muted-foreground">
                  Arkivra uses the timezone reported by your browser.
                </p>
              </div>
              <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm font-medium">
                {browserTimeZone}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(220px,280px)] sm:items-center">
              <div className="space-y-1">
                <Label htmlFor="preference-date-format">Date format</Label>
                <p className="text-sm text-muted-foreground">
                  Use browser defaults or choose a specific date pattern.
                </p>
              </div>
              <Select
                value={regionalPreferences.dateFormat ?? 'auto'}
                onValueChange={(value) =>
                  persistRegionalPreferences({
                    dateFormat: value === 'auto' ? null : value as PreferenceDateFormat,
                  })
                }
              >
                <SelectTrigger id="preference-date-format" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {dateFormatOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="theme" className="max-w-4xl min-w-0 rounded-md border bg-card">
          <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
            <TabsList className="grid w-full grid-cols-2 sm:w-md">
              <TabsTrigger value="theme">
                <Palette />
                Theme
              </TabsTrigger>
              <TabsTrigger value="layout">
                <Layout />
                Layout
              </TabsTrigger>
            </TabsList>
            <Button type="button" variant="outline" onClick={handleResetAppearance}>
              <RotateCcw />
              Reset
            </Button>
          </div>

          <TabsContent value="theme" className="mt-0">
            <ThemeTab
              applyRadius={applyRadius}
              applyTheme={applyTheme}
              applyTweakcnTheme={applyTweakcnTheme}
              brandColorsValues={brandColorsValues}
              handleColorChange={handleColorChange}
              isDarkMode={isDarkMode}
              onPreferenceChange={persistAppearancePreferences}
              resetTheme={resetTheme}
              selectedTheme={selectedTheme}
              setSelectedTheme={setSelectedTheme}
              selectedTweakcnTheme={selectedTweakcnTheme}
              setSelectedTweakcnTheme={setSelectedTweakcnTheme}
              selectedRadius={selectedRadius}
              setSelectedRadius={setSelectedRadius}
              setBrandColorsValues={setBrandColorsValues}
            />
          </TabsContent>

          <TabsContent value="layout" className="mt-0">
            <LayoutTab
              onPreferenceChange={(patch) =>
                persistAppearancePreferences({
                  sidebar: {
                    ...sidebarConfig,
                    ...patch,
                  },
                })
              }
            />
          </TabsContent>
        </Tabs>
      </div>
    </BaseLayout>
  );
}
