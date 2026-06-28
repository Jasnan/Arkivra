export function legacyDocumentSourceStorageKey({
  vaultId,
  documentId,
}: {
  vaultId: string;
  documentId: string;
}): string {
  return `${vaultId}/${documentId}`;
}

export function documentVersionSourceStorageKey({
  vaultId,
  documentVersionId,
}: {
  vaultId: string;
  documentVersionId: string;
}): string {
  return `${vaultId}/${documentVersionId}`;
}

export function legacyDocumentPagePreviewStorageKey({
  documentId,
  pageNumber,
}: {
  documentId: string;
  pageNumber: number;
}): string {
  return `previews/${documentId}/pages/${pageNumber}.png`;
}

export function legacyDocumentPagePreviewStoragePrefix(documentId: string): string {
  return `previews/${documentId}`;
}

export function documentVersionPagePreviewStorageKey({
  documentVersionId,
  pageNumber,
}: {
  documentVersionId: string;
  pageNumber: number;
}): string {
  return `previews/${documentVersionId}/pages/${pageNumber}.png`;
}

export function documentVersionPagePreviewStoragePrefix(documentVersionId: string): string {
  return `previews/${documentVersionId}`;
}

export function documentVersionPreviewPdfStorageKey({
  documentVersionId,
}: {
  documentVersionId: string;
}): string {
  return `previews/${documentVersionId}/document.preview.pdf`;
}

export function documentVersionChunkAssetStoragePrefix(documentVersionId: string): string {
  return `chunks/${documentVersionId}`;
}

function assertRelativeStoragePath(path: string): void {
  const segments = path.split('/');

  if (
    path.length === 0 ||
    path.startsWith('/') ||
    path.includes('\\') ||
    segments.some(segment => segment.length === 0 || segment === '.' || segment === '..')
  ) {
    throw new Error('Invalid storage asset path');
  }
}

export function documentVersionChunkAssetStorageKey({
  documentVersionId,
  assetPath,
}: {
  documentVersionId: string;
  assetPath: string;
}): string {
  assertRelativeStoragePath(assetPath);

  return `${documentVersionChunkAssetStoragePrefix(documentVersionId)}/${assetPath}`;
}
