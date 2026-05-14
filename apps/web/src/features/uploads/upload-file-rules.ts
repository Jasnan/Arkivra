import type { UploadFileInput } from './uploads.types';

const ALLOWED_EXTENSIONS = new Set([
  'bmp',
  'csv',
  'doc',
  'docx',
  'gif',
  'heic',
  'heif',
  'jpeg',
  'jpg',
  'json',
  'md',
  'pdf',
  'png',
  'rtf',
  'tif',
  'tiff',
  'txt',
  'webp',
]);

const ALLOWED_MIME_TYPES = new Set([
  'application/json',
  'application/msword',
  'application/pdf',
  'application/rtf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);
const PATH_SEPARATOR_PATTERN = /[\\/]+/;

function getPathParts(input: UploadFileInput) {
  const path = input.relativePath?.trim() || input.file.name;
  return path.split(PATH_SEPARATOR_PATTERN).filter(Boolean);
}

function getExtension(name: string) {
  const normalizedName = normalizeUploadFileName(name);
  const extension = normalizedName.split('.').pop()?.trim().toLocaleLowerCase();
  return extension && extension !== normalizedName.toLocaleLowerCase() ? extension : '';
}

export function normalizeUploadFileName(fileName: string) {
  const normalized = fileName.normalize('NFC').trim();
  return normalized.length > 0 ? normalized : 'untitled';
}

export function isHiddenUploadFile(input: UploadFileInput) {
  return getPathParts(input).some(part => part.startsWith('.'));
}

export function isAllowedUploadFile(input: UploadFileInput) {
  if (isHiddenUploadFile(input)) {
    return false;
  }

  const mimeType = input.file.type.toLocaleLowerCase();
  if (mimeType.startsWith('image/') || mimeType.startsWith('text/') || ALLOWED_MIME_TYPES.has(mimeType)) {
    return true;
  }

  return ALLOWED_EXTENSIONS.has(getExtension(input.file.name));
}

export function filterAllowedUploadFiles(files: UploadFileInput[]) {
  return files.filter(isAllowedUploadFile);
}

export function getUploadSourceRootName(input: UploadFileInput) {
  const parts = getPathParts(input);

  if (!input.relativePath || parts.length <= 1) {
    return null;
  }

  return parts[0] ?? null;
}
