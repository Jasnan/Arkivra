import type { Context } from 'hono';
import type { Database } from '../database/database.js';
import type { ServerContext } from '../server/server.types.js';
import type {
  DeletionImpactPreview,
  DocumentVersionSummary,
  UploadConflictStrategy,
} from './documents.services.js';
import { SEARCH_SORT_VALUES } from '../search/search.types.js';
import { and, eq } from 'drizzle-orm';
import { vaultFoldersTable } from '../database/schema/index.js';

export const browserPreviewImageMimeTypesByExtension = new Map([
  ['gif', 'image/gif'],
  ['jpeg', 'image/jpeg'],
  ['jpg', 'image/jpeg'],
  ['png', 'image/png'],
  ['webp', 'image/webp'],
]);

export function getDocumentFileExtension(fileName: string) {
  const extension = fileName.split('.').pop()?.trim().toLowerCase();
  return extension && extension !== fileName.trim().toLowerCase() ? extension : '';
}

export function getBrowserPreviewMimeType(fileName: string, mimeType: string) {
  const normalizedMimeType = mimeType.trim().toLowerCase() || 'application/octet-stream';

  if (normalizedMimeType !== 'application/octet-stream' && normalizedMimeType.length > 0) {
    return normalizedMimeType;
  }

  return (
    browserPreviewImageMimeTypesByExtension.get(getDocumentFileExtension(fileName)) ??
    normalizedMimeType
  );
}

export function parseUploadConflictStrategy(value: unknown) {
  if (value === undefined || value === null || value === '') {
    return { valid: true as const, strategy: undefined };
  }

  if (typeof value !== 'string') {
    return { valid: false as const };
  }

  const normalized = value.trim();
  if (normalized === 'skip' || normalized === 'keep_both' || normalized === 'new_version') {
    return { valid: true as const, strategy: normalized as UploadConflictStrategy };
  }

  return { valid: false as const };
}

export function parseSortBy(value: string | undefined) {
  if (value === undefined || value.trim().length === 0) {
    return 'created_desc' as const;
  }

  return SEARCH_SORT_VALUES.includes(value as any)
    ? (value as (typeof SEARCH_SORT_VALUES)[number])
    : null;
}

export function parseNullableFolderId(value: unknown) {
  if (value === undefined) {
    return { valid: true as const, folderId: undefined };
  }

  if (value === null || value === '' || value === 'root') {
    return { valid: true as const, folderId: null };
  }

  if (typeof value !== 'string') {
    return { valid: false as const };
  }

  const folderId = value.trim();
  return folderId.length > 0 ? { valid: true as const, folderId } : { valid: false as const };
}

export function getFolderDestinationErrorResponse(reason: string) {
  if (reason === 'parent_not_found' || reason === 'folder_not_found') {
    return {
      status: 404,
      body: { error: { code: 'folder.not_found', message: 'Folder not found' } },
    };
  }

  if (reason === 'path_too_long') {
    return {
      status: 400,
      body: { error: { code: 'folder.path_too_long', message: 'Folder path is too long' } },
    };
  }

  return {
    status: 400,
    body: { error: { code: 'folder.invalid_relative_path', message: 'Relative path is invalid' } },
  };
}

export function parsePageNumber(value: string | undefined) {
  if (value === undefined) {
    return null;
  }

  const normalized = value.endsWith('.png') ? value.slice(0, -4) : value;
  const parsed = Number.parseInt(normalized, 10);
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : null;
}

export function parseImpactLimit(value: string | undefined) {
  if (value === undefined || value.trim().length === 0) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= 0 ? Math.min(parsed, 25) : null;
}

export function matchesEtag(ifNoneMatch: string | null | undefined, etag: string) {
  if (ifNoneMatch === null || ifNoneMatch === undefined) {
    return false;
  }

  return ifNoneMatch
    .split(',')
    .map((value) => value.trim())
    .includes(etag);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export async function parseJsonObject(context: Context<ServerContext>) {
  const body = (await context.req.json().catch(() => null)) as unknown;

  if (!isRecord(body)) {
    return null;
  }

  return body;
}

export function serializeDocumentVersion(
  version: DocumentVersionSummary,
  { includeContent = false } = {},
) {
  return {
    id: version.id,
    documentId: version.documentId,
    vaultId: version.vaultId,
    versionNumber: version.versionNumber,
    isCurrent: version.isCurrent,
    uploadedBy: version.uploadedBy,
    uploadedAt: version.uploadedAt.toISOString(),
    originalName: version.originalName,
    originalSize: version.originalSize,
    originalSha256Hash: version.originalSha256Hash,
    mimeType: version.mimeType,
    language: version.language,
    parserEngine: version.parserEngine,
    parserEngineVersion: version.parserEngineVersion,
    parserWarnings: version.parserWarnings,
    processingStatus: version.processingStatus,
    restoredFromVersionId: version.restoredFromVersionId,
    deletedAt: version.deletedAt?.toISOString() ?? null,
    createdAt: version.createdAt.toISOString(),
    updatedAt: version.updatedAt.toISOString(),
    document: version.document,
    ...(includeContent
      ? {
          content: version.content,
          rawText: version.rawText,
          rawMarkdown: version.rawMarkdown,
          parserStructuredOutput: version.parserStructuredOutput,
        }
      : {}),
  };
}

export function serializeDeletionImpact(impact: DeletionImpactPreview) {
  return {
    affectedConversationCount: impact.affectedConversationCount,
    affectedConversations: impact.affectedConversations.map((conversation) => ({
      id: conversation.id,
      title: conversation.title,
      createdAt: conversation.createdAt.toISOString(),
      updatedAt: conversation.updatedAt.toISOString(),
    })),
    limit: impact.limit,
  };
}

export function getDocumentVersionAuditMetadata(
  version: DocumentVersionSummary,
  extra: Record<string, unknown> = {},
) {
  return {
    document_version_id: version.id,
    version_number: version.versionNumber,
    file_name: version.originalName,
    mime_type: version.mimeType,
    original_sha256_hash: version.originalSha256Hash,
    processing_status: version.processingStatus,
    restored_from_version_id: version.restoredFromVersionId,
    ...extra,
  };
}

export async function getFolderPathLabel({
  db,
  vaultId,
  folderId,
}: {
  db: Database;
  vaultId: string;
  folderId: string | null;
}) {
  if (folderId === null) {
    return 'Vault root';
  }

  const folders = await db
    .select({
      id: vaultFoldersTable.id,
      parentId: vaultFoldersTable.parentId,
      name: vaultFoldersTable.name,
    })
    .from(vaultFoldersTable)
    .where(and(eq(vaultFoldersTable.vaultId, vaultId), eq(vaultFoldersTable.isDeleted, false)));
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const path: string[] = [];
  const seen = new Set<string>();
  let current = byId.get(folderId) ?? null;

  while (current !== null && !seen.has(current.id)) {
    seen.add(current.id);
    path.unshift(current.name);
    current = current.parentId === null ? null : (byId.get(current.parentId) ?? null);
  }

  return path.length > 0 ? path.join(' / ') : 'Unknown location';
}

