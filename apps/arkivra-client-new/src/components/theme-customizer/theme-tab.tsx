"use client"

import { Dices, Sun, Moon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { useCircularTransition } from '@/hooks/use-circular-transition'
import { useTheme } from '@/hooks/use-theme'
import { colorThemes, tweakcnThemes } from '@/config/theme-data'
import { radiusOptions, baseColors } from '@/config/theme-customizer-constants'
import { ColorPicker } from '@/components/color-picker'
import type { AppearancePreferences } from '@/lib/appearance-preferences'
import type { ThemePreset } from '@/types/theme-customizer'
import type { Theme } from '@/contexts/theme-context'
import React from 'react'
import "./circular-transition.css"

interface ThemeTabProps {
  applyRadius: (radius: string) => void
  applyTheme: (themeValue: string, darkMode: boolean) => void
  applyTweakcnTheme: (themePreset: ThemePreset, darkMode: boolean) => void
  brandColorsValues: Record<string, string>
  handleColorChange: (cssVar: string, value: string) => void
  isDarkMode: boolean
  onPreferenceChange: (
    patch: Partial<AppearancePreferences>,
    options?: { notify?: boolean }
  ) => void
  resetTheme: () => void
  setBrandColorsValues: (values: Record<string, string>) => void
  selectedTheme: string
  setSelectedTheme: (theme: string) => void
  selectedTweakcnTheme: string
  setSelectedTweakcnTheme: (theme: string) => void
  selectedRadius: string
  setSelectedRadius: (radius: string) => void
}

export function ThemeTab({
  applyRadius,
  applyTheme,
  applyTweakcnTheme,
  brandColorsValues,
  handleColorChange,
  isDarkMode,
  onPreferenceChange,
  resetTheme,
  setBrandColorsValues,
  selectedTheme,
  setSelectedTheme,
  selectedTweakcnTheme,
  setSelectedTweakcnTheme,
  selectedRadius,
  setSelectedRadius,
}: ThemeTabProps) {
  const { startTransition } = useCircularTransition()
  const { setTheme } = useTheme()

  const handleRandomShadcn = () => {
    // Apply a random shadcn theme
    const randomTheme = colorThemes[Math.floor(Math.random() * colorThemes.length)]
    setSelectedTheme(randomTheme.value)
    setSelectedTweakcnTheme("") // Clear tweakcn selection
    applyTheme(randomTheme.value, isDarkMode)
    onPreferenceChange({
      selectedTheme: randomTheme.value,
      selectedTweakcnTheme: "",
      brandColors: {},
    })
  }

  const handleRandomTweakcn = () => {
    // Apply a random tweakcn theme
    const randomTheme = tweakcnThemes[Math.floor(Math.random() * tweakcnThemes.length)]
    setSelectedTweakcnTheme(randomTheme.value)
    setSelectedTheme("") // Clear shadcn selection
    applyTweakcnTheme(randomTheme.preset, isDarkMode)
    onPreferenceChange({
      selectedTheme: "",
      selectedTweakcnTheme: randomTheme.value,
      brandColors: {},
    })
  }

  const handleRadiusSelect = (radius: string) => {
    setSelectedRadius(radius)
    document.documentElement.style.setProperty('--radius', radius)
    onPreferenceChange({ selectedRadius: radius })
  }

  const handleModeChange = (
    event: React.MouseEvent<HTMLButtonElement>,
    nextTheme: Exclude<Theme, "system">
  ) => {
    if ((nextTheme === "light" && isDarkMode === false) || (nextTheme === "dark" && isDarkMode === true)) {
      return
    }

    onPreferenceChange({ themeMode: nextTheme }, { notify: false })

    startTransition({ x: event.clientX, y: event.clientY }, () => {
      setTheme(nextTheme)

      if (selectedTheme) {
        applyTheme(selectedTheme, nextTheme === "dark")
      } else if (selectedTweakcnTheme) {
        const selectedPreset = tweakcnThemes.find((theme) => theme.value === selectedTweakcnTheme)?.preset

        if (selectedPreset) {
          applyTweakcnTheme(selectedPreset, nextTheme === "dark")
        } else {
          resetTheme()
        }
      } else {
        resetTheme()
      }

      applyRadius(selectedRadius)

      Object.entries(brandColorsValues).forEach(([cssVar, value]) => {
        document.documentElement.style.setProperty(cssVar, value)
      })
      setBrandColorsValues(brandColorsValues)
    })
  }

  const handleLightMode = (event: React.MouseEvent<HTMLButtonElement>) => {
    handleModeChange(event, "light")
  }

  const handleDarkMode = (event: React.MouseEvent<HTMLButtonElement>) => {
    handleModeChange(event, "dark")
  }

  const handleBrandColorChange = (cssVar: string, value: string) => {
    handleColorChange(cssVar, value)
    onPreferenceChange({
      brandColors: {
        ...brandColorsValues,
        [cssVar]: value,
      },
    })
  }

  const activePresetSource = selectedTweakcnTheme
    ? "Tweakcn preset active"
    : selectedTheme
      ? "Shadcn UI preset active"
      : "No preset selected"

  return (
    <div className="p-4 space-y-6">

      {/* Theme Presets */}
      <div className="space-y-3">
        <div className="space-y-1">
          <Label className="text-sm font-medium">Theme presets</Label>
          <p className="text-xs text-muted-foreground">
            Choose one preset source. Selecting a Shadcn UI preset clears Tweakcn, and selecting a Tweakcn preset clears Shadcn UI.
          </p>
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <div className={`rounded-md border p-4 transition-colors ${
            selectedTheme ? "border-primary bg-primary/5" : "border-border"
          }`}>
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="space-y-1">
                <Label className="text-sm font-medium">Shadcn UI</Label>
                <p className="text-xs text-muted-foreground">Core shadcn palette presets.</p>
              </div>
              <Button variant="outline" size="sm" onClick={handleRandomShadcn} className="cursor-pointer">
                <Dices className="h-3.5 w-3.5 mr-1.5" />
                Random
              </Button>
            </div>

            <Select value={selectedTheme} onValueChange={(value) => {
              setSelectedTheme(value)
              setSelectedTweakcnTheme("") // Clear tweakcn selection
              applyTheme(value, isDarkMode)
              onPreferenceChange({
                selectedTheme: value,
                selectedTweakcnTheme: "",
                brandColors: {},
              })
            }}>
              <SelectTrigger className="w-full cursor-pointer">
                <SelectValue placeholder="Choose Shadcn Theme" />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                <div className="p-2">
                  {colorThemes.map((theme) => (
                    <SelectItem key={theme.value} value={theme.value} className="cursor-pointer">
                      <div className="flex items-center gap-2">
                        <div className="flex gap-1">
                          <div
                            className="w-3 h-3 rounded-full border border-border/20"
                            style={{ backgroundColor: theme.preset.styles.light.primary }}
                          />
                          <div
                            className="w-3 h-3 rounded-full border border-border/20"
                            style={{ backgroundColor: theme.preset.styles.light.secondary }}
                          />
                          <div
                            className="w-3 h-3 rounded-full border border-border/20"
                            style={{ backgroundColor: theme.preset.styles.light.accent }}
                          />
                          <div
                            className="w-3 h-3 rounded-full border border-border/20"
                            style={{ backgroundColor: theme.preset.styles.light.muted }}
                          />
                        </div>
                        <span>{theme.name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </div>
              </SelectContent>
            </Select>
          </div>

          <div className={`rounded-md border p-4 transition-colors ${
            selectedTweakcnTheme ? "border-primary bg-primary/5" : "border-border"
          }`}>
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="space-y-1">
                <Label className="text-sm font-medium">Tweakcn</Label>
                <p className="text-xs text-muted-foreground">Community theme presets.</p>
              </div>
              <Button variant="outline" size="sm" onClick={handleRandomTweakcn} className="cursor-pointer">
                <Dices className="h-3.5 w-3.5 mr-1.5" />
                Random
              </Button>
            </div>

            <Select value={selectedTweakcnTheme} onValueChange={(value) => {
              setSelectedTweakcnTheme(value)
              setSelectedTheme("") // Clear shadcn selection
              const selectedPreset = tweakcnThemes.find(t => t.value === value)?.preset
              if (selectedPreset) {
                applyTweakcnTheme(selectedPreset, isDarkMode)
              }
              onPreferenceChange({
                selectedTheme: "",
                selectedTweakcnTheme: value,
                brandColors: {},
              })
            }}>
              <SelectTrigger className="w-full cursor-pointer">
                <SelectValue placeholder="Choose Tweakcn Theme" />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                <div className="p-2">
                  {tweakcnThemes.map((theme) => (
                    <SelectItem key={theme.value} value={theme.value} className="cursor-pointer">
                      <div className="flex items-center gap-2">
                        <div className="flex gap-1">
                          <div
                            className="w-3 h-3 rounded-full border border-border/20"
                            style={{ backgroundColor: theme.preset.styles.light.primary }}
                          />
                          <div
                            className="w-3 h-3 rounded-full border border-border/20"
                            style={{ backgroundColor: theme.preset.styles.light.secondary }}
                          />
                          <div
                            className="w-3 h-3 rounded-full border border-border/20"
                            style={{ backgroundColor: theme.preset.styles.light.accent }}
                          />
                          <div
                            className="w-3 h-3 rounded-full border border-border/20"
                            style={{ backgroundColor: theme.preset.styles.light.muted }}
                          />
                        </div>
                        <span>{theme.name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </div>
              </SelectContent>
            </Select>
          </div>
        </div>

        <p className="text-xs font-medium text-muted-foreground">{activePresetSource}</p>
      </div>

      <Separator />

      {/* Radius Selection */}
      <div className="space-y-3">
        <Label className="text-sm font-medium">Radius</Label>
        <div className="grid grid-cols-5 gap-2">
          {radiusOptions.map((option) => (
            <div
              key={option.value}
              className={`relative cursor-pointer rounded-md p-3 border transition-colors ${
                selectedRadius === option.value
                  ? "border-primary"
                  : "border-border hover:border-border/60"
              }`}
              onClick={() => handleRadiusSelect(option.value)}
            >
              <div className="text-center">
                <div className="text-xs font-medium">{option.name}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <Separator />

      {/* Mode Section */}
      <div className="space-y-3">
        <Label className="text-sm font-medium">Mode</Label>
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant={!isDarkMode ? "secondary" : "outline"}
            size="sm"
            onClick={handleLightMode}
            className="cursor-pointer mode-toggle-button relative overflow-hidden"
          >
            <Sun className="h-4 w-4 mr-1 transition-transform duration-300" />
            Light
          </Button>
          <Button
            variant={isDarkMode ? "secondary" : "outline"}
            size="sm"
            onClick={handleDarkMode}
            className="cursor-pointer mode-toggle-button relative overflow-hidden"
          >
            <Moon className="h-4 w-4 mr-1 transition-transform duration-300" />
            Dark
          </Button>
        </div>
      </div>

      <Separator />
      {/* Brand Colors Section */}
      <Accordion type="single" collapsible className="w-full border-b rounded-lg">
        <AccordionItem value="brand-colors" className="border border-border rounded-lg overflow-hidden">
          <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-muted/50 transition-colors">
            <Label className="text-sm font-medium cursor-pointer">Brand Colors</Label>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4 pt-2 space-y-3 border-t border-border bg-muted/20">
            {baseColors.map((color) => (
              <div key={color.cssVar} className="flex items-center justify-between">
                <ColorPicker
                  label={color.name}
                  cssVar={color.cssVar}
                  value={brandColorsValues[color.cssVar] || ""}
                  onChange={handleBrandColorChange}
                />
              </div>
            ))}
          </AccordionContent>
        </AccordionItem>
      </Accordion>

    </div>
  )
}
