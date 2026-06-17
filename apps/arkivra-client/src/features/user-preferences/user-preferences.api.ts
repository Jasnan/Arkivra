import { fetchJson } from '@/lib/api';
import type { UserUiPreferences, UserUiPreferencesUpdate } from './user-preferences.types';

export async function getUserUiPreferences() {
  return fetchJson<{ preferences: UserUiPreferences }>('/api/me/preferences');
}

export async function updateUserUiPreferences(preferences: UserUiPreferencesUpdate) {
  return fetchJson<{ preferences: UserUiPreferences }>('/api/me/preferences', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(preferences),
  });
}
