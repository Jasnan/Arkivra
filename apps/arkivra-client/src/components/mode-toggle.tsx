"use client"

import * as React from "react"
import { Moon, Sun } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useTheme } from "@/hooks/use-theme"
import { useCircularTransition } from "@/hooks/use-circular-transition"
import { useThemeManager } from "@/hooks/use-theme-manager"
import { tweakcnThemes } from "@/config/theme-data"
import { authClient } from "@/lib/auth-client"
import {
  getAppearanceUserKey,
  saveServerAppearancePreferences,
  updateAppearancePreferences,
} from "@/lib/appearance-preferences"
import "./theme-customizer/circular-transition.css"

interface ModeToggleProps {
  variant?: "outline" | "ghost" | "default"
}

export function ModeToggle({ variant = "outline" }: ModeToggleProps) {
  const { theme, setTheme } = useTheme()
  const { startTransition } = useCircularTransition()
  const {
    applyRadius,
    applyTheme,
    applyTweakcnTheme,
    resetTheme,
    setBrandColorsValues,
  } = useThemeManager()
  const { data: sessionData } = authClient.useSession()
  const appearanceUserKey = React.useMemo(
    () => getAppearanceUserKey(sessionData?.user),
    [sessionData?.user]
  )
  const serverSaveQueueRef = React.useRef<Promise<unknown>>(Promise.resolve())

  // Simple, reliable dark mode detection with re-sync
  const [isDarkMode, setIsDarkMode] = React.useState(false)

  React.useEffect(() => {
    const updateMode = () => {
      if (theme === "dark") {
        setIsDarkMode(true)
      } else if (theme === "light") {
        setIsDarkMode(false)
      } else {
        setIsDarkMode(window.matchMedia("(prefers-color-scheme: dark)").matches)
      }
    }

    updateMode()

    // Listen for system theme changes
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)")
    mediaQuery.addEventListener("change", updateMode)

    return () => mediaQuery.removeEventListener("change", updateMode)
  }, [theme])

  const handleToggle = (event: React.MouseEvent<HTMLButtonElement>) => {
    const nextTheme = isDarkMode ? "light" : "dark"
    const coords = {
      x: event.clientX,
      y: event.clientY,
    }

    if (!appearanceUserKey) {
      startTransition(coords, () => {
        setTheme(nextTheme)
      })
      return
    }

    const preferences = updateAppearancePreferences(
      appearanceUserKey,
      { themeMode: nextTheme },
      { notify: false }
    )

    startTransition(coords, () => {
      setTheme(nextTheme)

      if (preferences.selectedTheme) {
        applyTheme(preferences.selectedTheme, nextTheme === "dark")
      } else if (preferences.selectedTweakcnTheme) {
        const selectedPreset = tweakcnThemes.find(
          (theme) => theme.value === preferences.selectedTweakcnTheme
        )?.preset

        if (selectedPreset) {
          applyTweakcnTheme(selectedPreset, nextTheme === "dark")
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
    })

    serverSaveQueueRef.current = serverSaveQueueRef.current
      .catch(() => undefined)
      .then(() => saveServerAppearancePreferences(preferences).catch(() => undefined))
  }

  return (
    <Button
      variant={variant}
      size="icon"
      onClick={handleToggle}
      className="cursor-pointer mode-toggle-button relative overflow-hidden"
    >
      {/* Show the icon for the mode you can switch TO */}
      {isDarkMode ? (
        <Sun className="h-[1.2rem] w-[1.2rem] transition-transform duration-300 rotate-0 scale-100" />
      ) : (
        <Moon className="h-[1.2rem] w-[1.2rem] transition-transform duration-300 rotate-0 scale-100" />
      )}
      <span className="sr-only">
        Switch to {isDarkMode ? "light" : "dark"} mode
      </span>
    </Button>
  )
}
