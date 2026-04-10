interface HealthResponse {
  status: string;
  version: string;
  timestamp: string;
}

async function fetchJson<T>(input: string, init?: RequestInit) {
  const response = await fetch(input, {
    credentials: 'include',
    ...init,
  });

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export async function getHealth() {
  return fetchJson<HealthResponse>('/api/health');
}
