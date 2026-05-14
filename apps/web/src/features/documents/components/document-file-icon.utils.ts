import { File, FileImage, FileSpreadsheet, FileText, FileType } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface DocumentFileIconMeta {
  badgeBg: string;
  badgeColor: string;
  color: string;
  icon: LucideIcon;
  label: string;
  type: 'file' | 'image' | 'pdf' | 'spreadsheet' | 'text' | 'word';
}

function getDocumentExtension(name: string) {
  const extension = name.split('.').pop()?.trim().toLowerCase();
  return extension && extension !== name.trim().toLowerCase() ? extension : '';
}

export function getDocumentTypeLabel({ name, mimeType }: { name: string; mimeType: string }) {
  const extension = getDocumentExtension(name).toUpperCase();

  if (extension && extension.length <= 5) {
    return extension;
  }

  if (mimeType === 'application/pdf') {
    return 'PDF';
  }

  if (mimeType.startsWith('image/')) {
    return 'IMG';
  }

  if (mimeType.includes('spreadsheet') || mimeType.includes('excel') || mimeType.includes('csv')) {
    return 'XLS';
  }

  if (mimeType.includes('word') || mimeType.includes('document')) {
    return 'DOC';
  }

  if (mimeType.startsWith('text/')) {
    return 'TXT';
  }

  return 'FILE';
}

export function getDocumentFileIconMeta({ name, mimeType }: { name: string; mimeType: string }): DocumentFileIconMeta {
  const extension = getDocumentExtension(name);
  const normalizedMimeType = mimeType.toLowerCase();

  if (normalizedMimeType === 'application/pdf' || extension === 'pdf') {
    return {
      badgeBg: 'bg.error',
      badgeColor: 'red.fg',
      color: 'red.fg',
      icon: FileText,
      label: 'PDF',
      type: 'pdf',
    };
  }

  if (
    extension === 'doc'
    || extension === 'docx'
    || normalizedMimeType.includes('word')
    || normalizedMimeType.includes('officedocument.wordprocessingml')
  ) {
    return {
      badgeBg: 'teal.subtle',
      badgeColor: 'purple.fg',
      color: 'purple.fg',
      icon: FileType,
      label: extension === 'doc' ? 'DOC' : 'DOCX',
      type: 'word',
    };
  }

  if (
    extension === 'xls'
    || extension === 'xlsx'
    || extension === 'csv'
    || normalizedMimeType.includes('spreadsheet')
    || normalizedMimeType.includes('excel')
    || normalizedMimeType.includes('csv')
  ) {
    return {
      badgeBg: 'bg.warning',
      badgeColor: 'yellow.fg',
      color: 'yellow.fg',
      icon: FileSpreadsheet,
      label: extension === 'csv' ? 'CSV' : extension === 'xls' ? 'XLS' : 'XLSX',
      type: 'spreadsheet',
    };
  }

  if (
    ['gif', 'jpeg', 'jpg', 'png', 'webp'].includes(extension)
    || normalizedMimeType.startsWith('image/')
  ) {
    return {
      badgeBg: 'bg.success',
      badgeColor: 'green.fg',
      color: 'green.fg',
      icon: FileImage,
      label: extension ? extension.toUpperCase() : 'IMG',
      type: 'image',
    };
  }

  if (extension === 'md' || extension === 'txt' || normalizedMimeType.startsWith('text/')) {
    return {
      badgeBg: 'bg.info',
      badgeColor: 'blue.fg',
      color: 'blue.fg',
      icon: FileText,
      label: extension === 'md' ? 'MD' : 'TXT',
      type: 'text',
    };
  }

  return {
    badgeBg: 'bg.subtle',
    badgeColor: 'fg.muted',
    color: 'fg.muted',
    icon: File,
    label: getDocumentTypeLabel({ name, mimeType }),
    type: 'file',
  };
}
