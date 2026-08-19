import { twoFactorClient } from "better-auth/client/plugins"
import { createAuthClient } from "better-auth/react"

function resolveBaseURL() {
  if (typeof window === "undefined") {
    return import.meta.env.VITE_ARKIVRA_WEB_BASE_URL ?? "/"
  }

  return window.location.origin
}

export const authClient = createAuthClient({
  baseURL: resolveBaseURL(),
  plugins: [twoFactorClient()],
})
