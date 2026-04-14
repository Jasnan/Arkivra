interface HealthResponse {
  status: string;
  version: string;
  timestamp: string;
}

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export async function fetchJson<T>(input: string, init?: RequestInit) {
  const response = await fetch(input, {
    credentials: 'include',
    ...init,
  });

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;

    try {
      const json = await response.json() as { error?: { message?: string } };
      message = json.error?.message ?? message;
    }
    catch {
    }

    throw new ApiError(message, response.status);
  }

  return response.json() as Promise<T>;
}

export async function getHealth() {
  return fetchJson<HealthResponse>('/api/health');
}
