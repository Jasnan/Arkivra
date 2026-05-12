import type { TransferItem } from './uploads.types';

const STORAGE_KEY = 'arkivra-upload-manager:transfers';

function getStorage() {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.sessionStorage ?? null;
}

export async function loadPersistedTransfers() {
  const storage = getStorage();
  if (storage === null) {
    return [];
  }

  try {
    const rawValue = storage.getItem(STORAGE_KEY);
    if (rawValue === null) {
      return [];
    }

    const parsed = JSON.parse(rawValue) as unknown;
    return Array.isArray(parsed) ? parsed as TransferItem[] : [];
  } catch {
    return [];
  }
}

export async function savePersistedTransfers(items: TransferItem[]) {
  const storage = getStorage();
  if (storage === null) {
    return;
  }

  storage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export async function clearPersistedTransfers() {
  getStorage()?.removeItem(STORAGE_KEY);
}
