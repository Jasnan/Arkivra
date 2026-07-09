import { fetchJson } from "@/lib/api"

export type PreferenceLanguage = "en"

export type PreferenceDateFormat =
  | "DD.MM.YYYY"
  | "DD/MM/YYYY"
  | "DD-MM-YYYY"
  | "MM/DD/YYYY"
  | "YYYY-MM-DD"
  | "YYYY/MM/DD"

export interface RegionalPreferences {
  language: PreferenceLanguage
  dateFormat: PreferenceDateFormat | null
}

export const DEFAULT_REGIONAL_PREFERENCES: RegionalPreferences = {
  language: "en",
  dateFormat: null,
}

const STORAGE_PREFIX = "arkivra:regional"
const BOOTSTRAP_USER_KEY = `${STORAGE_PREFIX}:bootstrap-user`
const LANGUAGES = new Set<PreferenceLanguage>(["en"])
const DATE_FORMATS = new Set<PreferenceDateFormat>([
  "DD.MM.YYYY",
  "DD/MM/YYYY",
  "DD-MM-YYYY",
  "MM/DD/YYYY",
  "YYYY-MM-DD",
  "YYYY/MM/DD",
])

function getStorage() {
  if (typeof window === "undefined") return null

  try {
    return window.localStorage
  } catch {
    return null
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

export function getRegionalStorageKey(userKey: string) {
  return `${STORAGE_PREFIX}:${encodeURIComponent(userKey)}`
}

export function setRegionalBootstrapUserKey(userKey: string) {
  const storage = getStorage()
  if (!storage) return

  storage.setItem(BOOTSTRAP_USER_KEY, userKey)
}

export function clearRegionalBootstrapUserKey() {
  const storage = getStorage()
  if (!storage) return

  storage.removeItem(BOOTSTRAP_USER_KEY)
}

export function readCurrentRegionalPreferences() {
  const storage = getStorage()
  if (!storage) return DEFAULT_REGIONAL_PREFERENCES

  const userKey = storage.getItem(BOOTSTRAP_USER_KEY)
  if (!userKey) return DEFAULT_REGIONAL_PREFERENCES

  return readRegionalPreferences(userKey)
}

export function normalizeRegionalPreferences(value: unknown): RegionalPreferences {
  if (!isRecord(value)) return DEFAULT_REGIONAL_PREFERENCES

  return {
    language: LANGUAGES.has(value.language as PreferenceLanguage)
      ? value.language as PreferenceLanguage
      : DEFAULT_REGIONAL_PREFERENCES.language,
    dateFormat: value.dateFormat === null
      ? null
      : DATE_FORMATS.has(value.dateFormat as PreferenceDateFormat)
        ? value.dateFormat as PreferenceDateFormat
        : DEFAULT_REGIONAL_PREFERENCES.dateFormat,
  }
}

export function readRegionalPreferences(userKey: string) {
  const storage = getStorage()
  if (!storage) return DEFAULT_REGIONAL_PREFERENCES

  const raw = storage.getItem(getRegionalStorageKey(userKey))
  if (!raw) return DEFAULT_REGIONAL_PREFERENCES

  try {
    return normalizeRegionalPreferences(JSON.parse(raw))
  } catch {
    return DEFAULT_REGIONAL_PREFERENCES
  }
}

export function writeRegionalPreferences(userKey: string, preferences: RegionalPreferences) {
  const storage = getStorage()
  const normalized = normalizeRegionalPreferences(preferences)

  if (storage) {
    storage.setItem(getRegionalStorageKey(userKey), JSON.stringify(normalized))
    setRegionalBootstrapUserKey(userKey)
  }

  return normalized
}

export function updateRegionalPreferences(
  userKey: string,
  patch: Partial<RegionalPreferences>
) {
  return writeRegionalPreferences(userKey, {
    ...readRegionalPreferences(userKey),
    ...patch,
  })
}

interface UserRegionalPreferencesResponse {
  preferences: {
    regionalPreferences: unknown
  }
}

export async function getServerRegionalPreferences() {
  const response = await fetchJson<UserRegionalPreferencesResponse>("/api/me/preferences")
  return normalizeRegionalPreferences(response.preferences.regionalPreferences)
}

export async function saveServerRegionalPreferences(preferences: RegionalPreferences) {
  const normalized = normalizeRegionalPreferences(preferences)
  const response = await fetchJson<UserRegionalPreferencesResponse>("/api/me/preferences", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ regionalPreferences: normalized }),
  })

  return normalizeRegionalPreferences(response.preferences.regionalPreferences)
}
