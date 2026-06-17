export function normalizeDocumentFileName(fileName: string): string {
  const normalized = fileName.normalize('NFC').trim();
  return normalized.length > 0 ? normalized : 'untitled';
}
