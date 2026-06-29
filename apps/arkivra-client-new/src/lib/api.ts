interface HealthResponse {
  status: string
  version: string
  timestamp: string
}

interface ApiErrorResponse {
  error?: {
    code?: unknown
    message?: unknown
  }
}

export class ApiError extends Error {
  status: number
  code?: string
  details?: Record<string, unknown>

  constructor(message: string, status: number, code?: string, details?: Record<string, unknown>) {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.code = code
    this.details = details
  }
}

export async function fetchJson<T>(input: string, init?: RequestInit) {
  const response = await fetch(input, {
    credentials: "include",
    ...init,
  })

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`
    let code: string | undefined
    let details: Record<string, unknown> | undefined

    try {
      const json = (await response.json()) as ApiErrorResponse
      if (typeof json.error?.message === "string") {
        message = json.error.message
      }
      if (typeof json.error?.code === "string") {
        code = json.error.code
      }
      if (json.error && typeof json.error === "object") {
        details = { ...json.error } as Record<string, unknown>
      }
    } catch {
      // Preserve the status-derived fallback message when the body is not JSON.
    }

    throw new ApiError(message, response.status, code, details)
  }

  if (response.status === 204 || response.status === 205) {
    return undefined as T
  }

  const contentLength = response.headers.get("content-length")
  if (contentLength === "0") {
    return undefined as T
  }

  return response.json() as Promise<T>
}

export async function getHealth() {
  return fetchJson<HealthResponse>("/api/health")
}
