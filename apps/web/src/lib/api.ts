interface HealthResponse {
  status: string;
  version: string;
  timestamp: string;
}

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

interface ApiErrorResponse {
  error?: {
    code?: unknown;
    message?: unknown;
  };
}

export async function fetchJson<T>(input: string, init?: RequestInit) {
  const response = await fetch(input, {
    credentials: 'include',
    ...init,
  });

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    let code: string | undefined;

    try {
      const json = await response.json() as ApiErrorResponse;
      if (typeof json.error?.message === 'string') {
        message = json.error.message;
      }
      if (typeof json.error?.code === 'string') {
        code = json.error.code;
      }
    }
    catch {
    }

    throw new ApiError(message, response.status, code);
  }

  if (response.status === 204 || response.status === 205) {
    return undefined as T;
  }

  const contentLength = response.headers.get('content-length');

  if (contentLength === '0') {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export async function getHealth() {
  return fetchJson<HealthResponse>('/api/health');
}
