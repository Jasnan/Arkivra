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

export default function AppearanceSettings() {
  const {
    applyRadius,
    applyTheme,
    applyTweakcnTheme,
    isDarkMode,
    resetTheme,
    setBrandColorsValues,
  } = useThemeManager()
  const { updateConfig: updateSidebarConfig } = useSidebarConfig()
  const [selectedTheme, setSelectedTheme] = React.useState("default")
  const [selectedTweakcnTheme, setSelectedTweakcnTheme] = React.useState("")
  const [selectedRadius, setSelectedRadius] = React.useState("0.5rem")

  function handleReset() {
    setSelectedTheme("")
    setSelectedTweakcnTheme("")
    setSelectedRadius("0.5rem")
    setBrandColorsValues({})
    resetTheme()
    applyRadius("0.5rem")
    updateSidebarConfig({ variant: "inset", collapsible: "offcanvas", side: "left" })
  }

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
                selectedTheme={selectedTheme}
                setSelectedTheme={setSelectedTheme}
                selectedTweakcnTheme={selectedTweakcnTheme}
                setSelectedTweakcnTheme={setSelectedTweakcnTheme}
                selectedRadius={selectedRadius}
                setSelectedRadius={setSelectedRadius}
              />
            </div>
          </TabsContent>

          <TabsContent value="layout" className="mt-6">
            <div className="max-w-4xl rounded-md border bg-card">
              <LayoutTab />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </BaseLayout>
  )
}
