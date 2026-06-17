import { fetchJson } from '@/lib/api';
import type { MeResponse } from './me.types';

export async function getMe() {
  return fetchJson<MeResponse>('/api/me');
}
