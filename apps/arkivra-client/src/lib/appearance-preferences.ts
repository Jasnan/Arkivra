import type { Theme } from "@/contexts/theme-context"
import type { SidebarConfig } from "@/contexts/sidebar-context"
import { fetchJson } from "@/lib/api"

export interface AppearancePreferences {
  themeMode: Theme
  selectedTheme: string
  selectedTweakcnTheme: string
  selectedRadius: string
  brandColors: Record<string, string>
  sidebar: SidebarConfig
}

export const DEFAULT_APPEARANCE_PREFERENCES: AppearancePreferences = {
  themeMode: "system",
  selectedTheme: "default",
  selectedTweakcnTheme: "",
  selectedRadius: "0.5rem",
  brandColors: {},
  sidebar: {
    variant: "inset",
    collapsible: "offcanvas",
    side: "left",
  },
}

const STORAGE_PREFIX = "arkivra:appearance"
const BOOTSTRAP_USER_KEY = `${STORAGE_PREFIX}:bootstrap-user`
export const APPEARANCE_PREFERENCES_CHANGED_EVENT = "arkivra:appearance-preferences-changed"
const THEME_MODES = new Set<Theme>(["dark", "light", "system"])
const SIDEBAR_VARIANTS = new Set<SidebarConfig["variant"]>(["sidebar", "floating", "inset"])
const SIDEBAR_COLLAPSIBLE = new Set<SidebarConfig["collapsible"]>(["offcanvas", "icon", "none"])
const SIDEBAR_SIDES = new Set<SidebarConfig["side"]>(["left", "right"])

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

function readString(value: unknown, fallback: string) {
  return typeof value === "string" ? value : fallback
}

function notifyAppearancePreferencesChanged(
  userKey: string,
  preferences: AppearancePreferences
) {
  if (typeof window === "undefined") return

  window.dispatchEvent(new CustomEvent(APPEARANCE_PREFERENCES_CHANGED_EVENT, {
    detail: {
      preferences,
      userKey,
    },
  }))
}

function normalizeBrandColors(value: unknown) {
  if (!isRecord(value)) return DEFAULT_APPEARANCE_PREFERENCES.brandColors

  const brandColors: Record<string, string> = {}

  Object.entries(value).forEach(([key, color]) => {
    if (key.startsWith("--") && typeof color === "string") {
      brandColors[key] = color
    }
  })

  return brandColors
}

function normalizeSidebar(value: unknown): SidebarConfig {
  if (!isRecord(value)) return DEFAULT_APPEARANCE_PREFERENCES.sidebar

  return {
    variant: SIDEBAR_VARIANTS.has(value.variant as SidebarConfig["variant"])
      ? value.variant as SidebarConfig["variant"]
      : DEFAULT_APPEARANCE_PREFERENCES.sidebar.variant,
    collapsible: SIDEBAR_COLLAPSIBLE.has(value.collapsible as SidebarConfig["collapsible"])
      ? value.collapsible as SidebarConfig["collapsible"]
      : DEFAULT_APPEARANCE_PREFERENCES.sidebar.collapsible,
    side: SIDEBAR_SIDES.has(value.side as SidebarConfig["side"])
      ? value.side as SidebarConfig["side"]
      : DEFAULT_APPEARANCE_PREFERENCES.sidebar.side,
  }
}

export function getAppearanceUserKey(user: unknown) {
  if (!isRecord(user)) return null

  const id = typeof user.id === "string" ? user.id.trim() : ""
  if (id) return id

  const email = typeof user.email === "string" ? user.email.trim() : ""
  return email || null
}

export function getAppearanceStorageKey(userKey: string) {
  return `${STORAGE_PREFIX}:${encodeURIComponent(userKey)}`
}

export function setAppearanceBootstrapUserKey(userKey: string) {
  const storage = getStorage()
  if (!storage) return

  storage.setItem(BOOTSTRAP_USER_KEY, userKey)
}

export function clearAppearanceBootstrapUserKey() {
  const storage = getStorage()
  if (!storage) return

  storage.removeItem(BOOTSTRAP_USER_KEY)
}

export function normalizeAppearancePreferences(value: unknown): AppearancePreferences {
  if (!isRecord(value)) return DEFAULT_APPEARANCE_PREFERENCES

  const themeMode = THEME_MODES.has(value.themeMode as Theme)
    ? value.themeMode as Theme
    : DEFAULT_APPEARANCE_PREFERENCES.themeMode

  return {
    themeMode,
    selectedTheme: readString(value.selectedTheme, DEFAULT_APPEARANCE_PREFERENCES.selectedTheme),
    selectedTweakcnTheme: readString(
      value.selectedTweakcnTheme,
      DEFAULT_APPEARANCE_PREFERENCES.selectedTweakcnTheme
    ),
    selectedRadius: readString(value.selectedRadius, DEFAULT_APPEARANCE_PREFERENCES.selectedRadius),
    brandColors: normalizeBrandColors(value.brandColors),
    sidebar: normalizeSidebar(value.sidebar),
  }
}

export function readAppearancePreferences(userKey: string) {
  const storage = getStorage()
  if (!storage) return DEFAULT_APPEARANCE_PREFERENCES

  const raw = storage.getItem(getAppearanceStorageKey(userKey))
  if (!raw) return DEFAULT_APPEARANCE_PREFERENCES

  try {
    return normalizeAppearancePreferences(JSON.parse(raw))
  } catch {
    return DEFAULT_APPEARANCE_PREFERENCES
  }
}

export function writeAppearancePreferences(
  userKey: string,
  preferences: AppearancePreferences,
  options: { notify?: boolean } = {}
) {
  const storage = getStorage()
  if (!storage) return preferences

  const normalized = normalizeAppearancePreferences(preferences)
  storage.setItem(getAppearanceStorageKey(userKey), JSON.stringify(normalized))
  setAppearanceBootstrapUserKey(userKey)
  if (options.notify !== false) {
    notifyAppearancePreferencesChanged(userKey, normalized)
  }
  return normalized
}

export function updateAppearancePreferences(
  userKey: string,
  patch: Partial<AppearancePreferences>,
  options: { notify?: boolean } = {}
) {
  const current = readAppearancePreferences(userKey)
  const sidebar = patch.sidebar
    ? {
        ...current.sidebar,
        ...patch.sidebar,
      }
    : current.sidebar

  return writeAppearancePreferences(
    userKey,
    {
      ...current,
      ...patch,
      sidebar,
      brandColors: patch.brandColors ?? current.brandColors,
    },
    options
  )
}

interface UserAppearancePreferencesResponse {
  preferences: {
    appearancePreferences: unknown
  }
}

export async function getServerAppearancePreferences() {
  const response = await fetchJson<UserAppearancePreferencesResponse>("/api/me/preferences")
  return normalizeAppearancePreferences(response.preferences.appearancePreferences)
}

export async function saveServerAppearancePreferences(preferences: AppearancePreferences) {
  const normalized = normalizeAppearancePreferences(preferences)
  const response = await fetchJson<UserAppearancePreferencesResponse>("/api/me/preferences", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ appearancePreferences: normalized }),
  })

  return normalizeAppearancePreferences(response.preferences.appearancePreferences)
}
