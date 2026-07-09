"use client"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface TimezoneSelectProps {
  value?: string
  onValueChange?: (value: string) => void
  placeholder?: string
}

export function TimezoneSelect({
  onValueChange,
  placeholder = "Select Timezone",
  value,
}: TimezoneSelectProps) {
  return (
    <Select onValueChange={onValueChange} value={value}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="pst">PST (Pacific Standard Time)</SelectItem>
        <SelectItem value="est">EST (Eastern Standard Time)</SelectItem>
        <SelectItem value="cst">CST (Central Standard Time)</SelectItem>
        <SelectItem value="mst">MST (Mountain Standard Time)</SelectItem>
        <SelectItem value="utc">UTC (Coordinated Universal Time)</SelectItem>
        <SelectItem value="cet">CET (Central European Time)</SelectItem>
        <SelectItem value="jst">JST (Japan Standard Time)</SelectItem>
        <SelectItem value="aest">AEST (Australian Eastern Standard Time)</SelectItem>
      </SelectContent>
    </Select>
  )
}
