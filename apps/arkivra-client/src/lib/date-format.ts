import { readCurrentRegionalPreferences, type PreferenceDateFormat } from "@/lib/regional-preferences"

type DateInput = Date | number | string | null | undefined

function toDate(value: DateInput) {
  if (!value) return null

  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function getDateFormat() {
  return readCurrentRegionalPreferences().dateFormat
}

function padDatePart(value: number) {
  return String(value).padStart(2, "0")
}

function formatPatternDate(date: Date, dateFormat: PreferenceDateFormat) {
  const day = padDatePart(date.getDate())
  const month = padDatePart(date.getMonth() + 1)
  const year = String(date.getFullYear())

  switch (dateFormat) {
    case "DD.MM.YYYY":
      return `${day}.${month}.${year}`
    case "DD/MM/YYYY":
      return `${day}/${month}/${year}`
    case "DD-MM-YYYY":
      return `${day}-${month}-${year}`
    case "MM/DD/YYYY":
      return `${month}/${day}/${year}`
    case "YYYY-MM-DD":
      return `${year}-${month}-${day}`
    case "YYYY/MM/DD":
      return `${year}/${month}/${day}`
  }
}

function includesTime(options: Intl.DateTimeFormatOptions) {
  return options.timeStyle !== undefined
    || options.hour !== undefined
    || options.minute !== undefined
    || options.second !== undefined
}

function getTimeOptions(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormatOptions {
  if (options.timeStyle !== undefined) {
    return { timeStyle: options.timeStyle }
  }

  return {
    hour: options.hour,
    minute: options.minute,
    second: options.second,
  }
}

export function formatDate(
  value: DateInput,
  options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" },
  fallback = "Unknown",
) {
  const date = toDate(value)
  if (!date) return fallback

  const dateFormat = getDateFormat()
  if (dateFormat !== null) {
    const formattedDate = formatPatternDate(date, dateFormat)
    if (!includesTime(options)) return formattedDate

    const formattedTime = new Intl.DateTimeFormat(undefined, getTimeOptions(options)).format(date)
    return `${formattedDate}, ${formattedTime}`
  }

  return new Intl.DateTimeFormat(undefined, options).format(date)
}

export function formatDateTime(value: DateInput, fallback = "Unknown") {
  return formatDate(
    value,
    {
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      month: "short",
      year: "numeric",
    },
    fallback,
  )
}

export function formatShortDate(value: DateInput, fallback = "Unknown") {
  return formatDate(value, { day: "numeric", month: "short", year: "numeric" }, fallback)
}
