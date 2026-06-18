import { vi } from 'vitest';

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export function folderItemsResponse(
  overrides: Partial<{
    folder: unknown;
    breadcrumbs: unknown[];
    folders: unknown[];
    documents: unknown[];
    items: unknown[];
  }> = {},
) {
  const folders = overrides.folders ?? [];
  const documents = overrides.documents ?? [];

  return {
    folder: null,
    breadcrumbs: [],
    folders,
    documents,
    items: overrides.items ?? [
      ...folders.map((folder) => ({ type: 'folder', folder })),
      ...documents.map((document) => ({ type: 'document', document })),
    ],
    ...overrides,
  };
}

export function vaultDetailResponse(overrides: Record<string, unknown> = {}) {
  return {
    vault: {
      id: 'vlt_1',
      name: 'Personal',
      description: null,
      fileCount: 1,
      totalSize: 2048,
      createdAt: '2026-04-10T10:00:00.000Z',
      role: 'owner',
      aiAccessLevel: 'full',
      isAdmin: false,
      isMember: true,
      accessMode: 'member',
      ...overrides,
    },
  };
}

export function documentSummary(overrides: Record<string, unknown> = {}) {
  return {
    id: 'doc_1',
    name: 'Invoice April.pdf',
    originalName: 'invoice.pdf',
    originalSize: 2048,
    mimeType: 'application/pdf',
    folderId: null,
    createdAt: '2026-04-10T10:00:00.000Z',
    updatedAt: '2026-04-10T10:00:00.000Z',
    isDeleted: false,
    deletedAt: null,
    ...overrides,
  };
}

export function enableExtractedTextPreference() {
  const preferences = JSON.stringify({
    themeMode: 'system',
    accentColor: 'teal',
    density: 'comfortable',
    fontFamily: 'inter',
    fontSize: 'md',
    radius: 'md',
    language: 'en',
    showExtractedTextTab: true,
  });

  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: vi.fn((key: string) => (key === 'arkivra.uiPreferences' ? preferences : null)),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    },
  });
}
