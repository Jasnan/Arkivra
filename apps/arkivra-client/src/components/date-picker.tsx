"use client"

import { useMemo, useState } from "react"
import { CalendarDays, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { formatShortDate } from "@/lib/date-format"
import { cn } from "@/lib/utils"

function parseDateValue(value?: string) {
  if (!value) return undefined

  const [year, month, day] = value.split("-").map(Number)
  if (!year || !month || !day) return undefined

  return new Date(year, month - 1, day)
}

function toDateValue(date: Date) {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, "0")
  const day = `${date.getDate()}`.padStart(2, "0")
  return `${year}-${month}-${day}`
}

function formatDateValue(value?: string) {
  const date = parseDateValue(value)
  if (!date) return null

  return formatShortDate(date)
}

export function DatePicker({
  id,
  value,
  min,
  max,
  placeholder = "Select date",
  ariaLabel,
  className,
  onChange,
}: {
  id?: string
  value?: string
  min?: string
  max?: string
  placeholder?: string
  ariaLabel?: string
  className?: string
  onChange: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const selectedDate = useMemo(() => parseDateValue(value), [value])
  const minDate = useMemo(() => parseDateValue(min), [min])
  const maxDate = useMemo(() => parseDateValue(max), [max])
  const label = formatDateValue(value)
  const disabledMatchers = [
    ...(minDate ? [{ before: minDate }] : []),
    ...(maxDate ? [{ after: maxDate }] : []),
  ]

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          aria-label={ariaLabel}
          className={cn("h-10 w-full justify-between px-3 font-normal", !label && "text-muted-foreground", className)}
        >
          <span className="flex min-w-0 items-center gap-2">
            <CalendarDays className="size-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{label ?? placeholder}</span>
          </span>
          {value ? (
            <span
              role="button"
              tabIndex={0}
              aria-label="Clear date"
              className="ml-2 rounded-sm p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              onPointerDown={(event) => {
                event.preventDefault()
                event.stopPropagation()
                onChange("")
              }}
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                onChange("")
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault()
                  event.stopPropagation()
                  onChange("")
                }
              }}
            >
              <X className="size-3.5" />
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          mode="single"
          selected={selectedDate}
          defaultMonth={selectedDate ?? maxDate ?? minDate}
          disabled={disabledMatchers.length > 0 ? disabledMatchers : undefined}
          captionLayout="dropdown"
          onSelect={(date) => {
            if (!date) return
            onChange(toDateValue(date))
            setOpen(false)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}
