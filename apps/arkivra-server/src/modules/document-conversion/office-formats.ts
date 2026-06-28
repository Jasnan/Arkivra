const supportedExtensions = new Set([
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.odt',
  '.ods',
  '.odp',
]);

const supportedMimeTypes = new Set([
  'application/msword',
  'application/vnd.ms-excel',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.oasis.opendocument.spreadsheet',
  'application/vnd.oasis.opendocument.presentation',
]);

export function getFileExtension(fileName: string) {
  const normalized = fileName.trim().toLocaleLowerCase();
  const dotIndex = normalized.lastIndexOf('.');

  return dotIndex > 0 ? normalized.slice(dotIndex) : '';
}

export function isOfficeDocumentConvertible({
  fileName,
  mimeType,
}: {
  fileName: string;
  mimeType: string;
}) {
  const normalizedMimeType = mimeType.trim().toLocaleLowerCase();

  return supportedMimeTypes.has(normalizedMimeType) || supportedExtensions.has(getFileExtension(fileName));
}

export function previewPdfFileName(fileName: string) {
  const dotIndex = fileName.lastIndexOf('.');
  const baseName = dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName;

  return `${baseName}.preview.pdf`;
}
