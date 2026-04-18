import type { TransferItem } from './uploads.types';

const DB_NAME = 'arkivra-upload-manager';
const STORE_NAME = 'transfers';
const DB_VERSION = 1;

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open upload persistence database'));
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T> | void,
) {
  const database = await openDatabase();

  return new Promise<T | void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    const request = operation(store);

    transaction.oncomplete = () => resolve(request?.result);
    transaction.onerror = () => reject(transaction.error ?? new Error('Upload persistence transaction failed'));
    transaction.onabort = () => reject(transaction.error ?? new Error('Upload persistence transaction aborted'));
  }).finally(() => {
    database.close();
  });
}

export async function loadPersistedTransfers() {
  const result = await withStore<TransferItem[]>('readonly', store => store.getAll());
  return (result as TransferItem[] | undefined) ?? [];
}

export async function savePersistedTransfers(items: TransferItem[]) {
  await withStore('readwrite', (store) => {
    store.clear();
    for (const item of items) {
      store.put(item);
    }
  });
}

export async function clearPersistedTransfers() {
  await withStore('readwrite', store => store.clear());
}
