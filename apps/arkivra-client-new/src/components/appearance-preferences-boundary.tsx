"use client"

import * as React from "react"

import { tweakcnThemes } from "@/config/theme-data"
import { useSidebarConfig } from "@/contexts/sidebar-context"
import type { Theme } from "@/contexts/theme-context"
import { useThemeManager } from "@/hooks/use-theme-manager"
import {
  APPEARANCE_PREFERENCES_CHANGED_EVENT,
  DEFAULT_APPEARANCE_PREFERENCES,
  getServerAppearancePreferences,
  readAppearancePreferences,
  type AppearancePreferences,
  writeAppearancePreferences,
} from "@/lib/appearance-preferences"

function resolveDarkMode(themeMode: Theme) {
  if (themeMode === "dark") return true
  if (themeMode === "light") return false

  return window.matchMedia("(prefers-color-scheme: dark)").matches
}

function useApplyAppearancePreferences(
  preferences: AppearancePreferences,
  sourceKey: string
) {
  const { updateConfig: updateSidebarConfig } = useSidebarConfig()
  const {
    applyRadius,
    applyTheme,
    applyTweakcnTheme,
    resetTheme,
    setBrandColorsValues,
    setTheme,
  } = useThemeManager()

  React.useLayoutEffect(() => {
    const darkMode = resolveDarkMode(preferences.themeMode)

    setTheme(preferences.themeMode)

    if (preferences.selectedTheme) {
      applyTheme(preferences.selectedTheme, darkMode)
    } else if (preferences.selectedTweakcnTheme) {
      const selectedPreset = tweakcnThemes.find(
        (theme) => theme.value === preferences.selectedTweakcnTheme
      )?.preset

      if (selectedPreset) {
        applyTweakcnTheme(selectedPreset, darkMode)
      } else {
        resetTheme()
      }
    } else {
      resetTheme()
    }

    applyRadius(preferences.selectedRadius)

    Object.entries(preferences.brandColors).forEach(([cssVar, value]) => {
      document.documentElement.style.setProperty(cssVar, value)
    })
    setBrandColorsValues(preferences.brandColors)
    updateSidebarConfig(preferences.sidebar)
  }, [
    applyRadius,
    applyTheme,
    applyTweakcnTheme,
    preferences,
    resetTheme,
    setBrandColorsValues,
    setTheme,
    sourceKey,
    updateSidebarConfig,
  ])
}

export function AuthenticatedAppearanceBoundary({
  children,
  userKey,
}: {
  children: React.ReactNode
  userKey: string | null
}) {
  const [preferences, setPreferences] = React.useState<AppearancePreferences>(
    () => userKey ? readAppearancePreferences(userKey) : DEFAULT_APPEARANCE_PREFERENCES
  )
  const localRevisionRef = React.useRef(0)

  React.useEffect(() => {
    if (!userKey) {
      setPreferences(DEFAULT_APPEARANCE_PREFERENCES)
      return
    }

    let ignore = false
    const requestRevision = localRevisionRef.current

    function handlePreferencesChanged(event: Event) {
      const detail = (event as CustomEvent<{
        preferences?: AppearancePreferences
        userKey?: string
      }>).detail

      if (detail?.userKey !== userKey || !detail.preferences) return

      localRevisionRef.current += 1
      setPreferences(detail.preferences)
    }

    window.addEventListener(
      APPEARANCE_PREFERENCES_CHANGED_EVENT,
      handlePreferencesChanged
    )

    setPreferences(readAppearancePreferences(userKey))

    getServerAppearancePreferences()
      .then((serverPreferences) => {
        if (ignore || localRevisionRef.current !== requestRevision) return

        const cachedPreferences = writeAppearancePreferences(userKey, serverPreferences)
        setPreferences(cachedPreferences)
      })
      .catch(() => {
        // Keep the local cache applied if the server is temporarily unavailable.
      })

    return () => {
      ignore = true
      window.removeEventListener(
        APPEARANCE_PREFERENCES_CHANGED_EVENT,
        handlePreferencesChanged
      )
    }
  }, [userKey])

  useApplyAppearancePreferences(preferences, `user:${userKey ?? "none"}`)

  return <>{children}</>
}

export function PublicAppearanceBoundary({ children }: { children: React.ReactNode }) {
  useApplyAppearancePreferences(DEFAULT_APPEARANCE_PREFERENCES, "public")

  return <>{children}</>
}
