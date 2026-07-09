"use client"

import { Grid3X3, List } from "lucide-react"

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useVaultsView, type VaultsView } from "../use-vaults-view"

export function VaultsViewToggle() {
  const [view, setView] = useVaultsView()

  function handleValueChange(nextView: string) {
    if (nextView === "grid" || nextView === "list") {
      setView(nextView as VaultsView)
    }
  }

  return (
    <ToggleGroup
      type="single"
      value={view}
      onValueChange={handleValueChange}
      variant="outline"
      size="sm"
      aria-label="Vault view"
    >
      <ToggleGroupItem value="grid" aria-label="Grid view">
        <Grid3X3 className="size-4" />
      </ToggleGroupItem>
      <ToggleGroupItem value="list" aria-label="List view">
        <List className="size-4" />
      </ToggleGroupItem>
    </ToggleGroup>
  )
}
