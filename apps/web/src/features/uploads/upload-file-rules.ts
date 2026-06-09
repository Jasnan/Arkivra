import type { UploadFileInput } from './uploads.types';

const ALLOWED_UPLOAD_EXTENSIONS = [
  'csv',
  'doc',
  'docx',
  'gif',
  'jpeg',
  'jpg',
  'json',
  'md',
  'pdf',
  'png',
  'txt',
  'webp',
  'xls',
  'xlsx',
] as const;

const ALLOWED_UPLOAD_MIME_TYPES = [
  'application/csv',
  'application/json',
  'application/msword',
  'application/pdf',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
  'text/csv',
  'text/markdown',
  'text/plain',
] as const;

const ALLOWED_EXTENSIONS = new Set<string>(ALLOWED_UPLOAD_EXTENSIONS);
const ALLOWED_MIME_TYPES = new Set<string>(ALLOWED_UPLOAD_MIME_TYPES);
export const UPLOAD_ACCEPT_ATTRIBUTE = [
  ...ALLOWED_UPLOAD_EXTENSIONS.map(extension => `.${extension}`),
  ...ALLOWED_UPLOAD_MIME_TYPES,
].join(',');
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
  if (ALLOWED_MIME_TYPES.has(mimeType)) {
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
