"use client"

import * as React from "react"
import { Layout, Palette, RotateCcw } from "lucide-react"

import { BaseLayout } from "@/components/layouts/base-layout"
import { LayoutTab } from "@/components/theme-customizer/layout-tab"
import { ThemeTab } from "@/components/theme-customizer/theme-tab"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { tweakcnThemes } from "@/config/theme-data"
import { useSidebarConfig } from "@/contexts/sidebar-context"
import { useThemeManager } from "@/hooks/use-theme-manager"
import { authClient } from "@/lib/auth-client"
import {
  DEFAULT_APPEARANCE_PREFERENCES,
  getAppearanceUserKey,
  getServerAppearancePreferences,
  readAppearancePreferences,
  saveServerAppearancePreferences,
  updateAppearancePreferences,
  writeAppearancePreferences,
  type AppearancePreferences,
} from "@/lib/appearance-preferences"

export default function AppearanceSettings() {
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
  } = useThemeManager()
  const { config: sidebarConfig, updateConfig: updateSidebarConfig } = useSidebarConfig()
  const { data: sessionData } = authClient.useSession()
  const appearanceUserKey = React.useMemo(
    () => getAppearanceUserKey(sessionData?.user),
    [sessionData?.user]
  )
  const [selectedTheme, setSelectedTheme] = React.useState(DEFAULT_APPEARANCE_PREFERENCES.selectedTheme)
  const [selectedTweakcnTheme, setSelectedTweakcnTheme] = React.useState(DEFAULT_APPEARANCE_PREFERENCES.selectedTweakcnTheme)
  const [selectedRadius, setSelectedRadius] = React.useState(DEFAULT_APPEARANCE_PREFERENCES.selectedRadius)
  const localRevisionRef = React.useRef(0)
  const serverSaveQueueRef = React.useRef<Promise<unknown>>(Promise.resolve())

  const persistPreferences = React.useCallback((
    patch: Partial<AppearancePreferences>,
    options?: { notify?: boolean }
  ) => {
    if (!appearanceUserKey) return DEFAULT_APPEARANCE_PREFERENCES
    localRevisionRef.current += 1
    const preferences = updateAppearancePreferences(appearanceUserKey, patch, options)
    serverSaveQueueRef.current = serverSaveQueueRef.current
      .catch(() => undefined)
      .then(() => saveServerAppearancePreferences(preferences).catch(() => undefined))
    return preferences
  }, [appearanceUserKey])

  function handleReset() {
    setSelectedTheme(DEFAULT_APPEARANCE_PREFERENCES.selectedTheme)
    setSelectedTweakcnTheme(DEFAULT_APPEARANCE_PREFERENCES.selectedTweakcnTheme)
    setSelectedRadius(DEFAULT_APPEARANCE_PREFERENCES.selectedRadius)
    setBrandColorsValues({})
    resetTheme()
    applyRadius(DEFAULT_APPEARANCE_PREFERENCES.selectedRadius)
    setTheme(DEFAULT_APPEARANCE_PREFERENCES.themeMode)
    updateSidebarConfig(DEFAULT_APPEARANCE_PREFERENCES.sidebar)
    persistPreferences(DEFAULT_APPEARANCE_PREFERENCES)
  }

  const applyStoredPreferences = React.useCallback((preferences: AppearancePreferences) => {
    setSelectedTheme(preferences.selectedTheme)
    setSelectedTweakcnTheme(preferences.selectedTweakcnTheme)
    setSelectedRadius(preferences.selectedRadius)
    setBrandColorsValues(preferences.brandColors)
    setTheme(preferences.themeMode)
    applyRadius(preferences.selectedRadius)
    updateSidebarConfig(preferences.sidebar)
  }, [
    applyRadius,
    setBrandColorsValues,
    setTheme,
    updateSidebarConfig,
  ])

  React.useEffect(() => {
    if (!appearanceUserKey) return

    let ignore = false
    const requestRevision = localRevisionRef.current

    applyStoredPreferences(readAppearancePreferences(appearanceUserKey))

    getServerAppearancePreferences()
      .then((serverPreferences) => {
        if (ignore || localRevisionRef.current !== requestRevision) return

        const cachedPreferences = writeAppearancePreferences(appearanceUserKey, serverPreferences)
        applyStoredPreferences(cachedPreferences)
      })
      .catch(() => undefined)

    return () => {
      ignore = true
    }
  }, [
    appearanceUserKey,
    applyStoredPreferences,
  ])

  React.useEffect(() => {
    if (selectedTheme) {
      applyTheme(selectedTheme, isDarkMode)
      return
    }

    if (selectedTweakcnTheme) {
      const selectedPreset = tweakcnThemes.find((theme) => theme.value === selectedTweakcnTheme)?.preset
      if (selectedPreset) {
        applyTweakcnTheme(selectedPreset, isDarkMode)
      }
    }
  }, [
    applyTheme,
    applyTweakcnTheme,
    isDarkMode,
    selectedTheme,
    selectedTweakcnTheme,
  ])

  React.useEffect(() => {
    applyRadius(selectedRadius)
  }, [
    applyRadius,
    isDarkMode,
    selectedRadius,
    selectedTheme,
    selectedTweakcnTheme,
  ])

  React.useEffect(() => {
    Object.entries(brandColorsValues).forEach(([cssVar, value]) => {
      document.documentElement.style.setProperty(cssVar, value)
    })
  }, [brandColorsValues])

  return (
    <BaseLayout>
      <div className="space-y-6 px-4 lg:px-6">
        <header className="border-b pb-4">
          <div className="space-y-1.5">
            <h1 className="text-3xl font-bold tracking-tight">Appearance</h1>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Adjust theme colors, mode, radius, and layout preferences.
            </p>
          </div>
        </header>

        <Tabs defaultValue="theme" className="min-w-0">
          <div className="flex max-w-4xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
            <Button type="button" variant="outline" onClick={handleReset}>
              <RotateCcw />
              Reset
            </Button>
          </div>

          <TabsContent value="theme" className="mt-6">
            <div className="max-w-4xl rounded-md border bg-card">
              <ThemeTab
                applyRadius={applyRadius}
                applyTheme={applyTheme}
                applyTweakcnTheme={applyTweakcnTheme}
                brandColorsValues={brandColorsValues}
                handleColorChange={handleColorChange}
                isDarkMode={isDarkMode}
                onPreferenceChange={persistPreferences}
                resetTheme={resetTheme}
                selectedTheme={selectedTheme}
                setSelectedTheme={setSelectedTheme}
                selectedTweakcnTheme={selectedTweakcnTheme}
                setSelectedTweakcnTheme={setSelectedTweakcnTheme}
                selectedRadius={selectedRadius}
                setSelectedRadius={setSelectedRadius}
                setBrandColorsValues={setBrandColorsValues}
              />
            </div>
          </TabsContent>

          <TabsContent value="layout" className="mt-6">
            <div className="max-w-4xl rounded-md border bg-card">
              <LayoutTab
                onPreferenceChange={(patch) => persistPreferences({
                  sidebar: {
                    ...sidebarConfig,
                    ...patch,
                  },
                })}
              />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </BaseLayout>
  )
}
