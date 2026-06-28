import { File, FileImage, FileJson, FileSpreadsheet, FileText } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import csvFileIconSvg from '@/assets/file-type-csv.svg?raw';
import pdfFileIconSvg from '@/assets/file-type-pdf.svg?raw';
import wordFileIconSvg from '@/assets/file-word.svg?raw';

interface BaseDocumentFileIconMeta {
  badgeBg: string;
  badgeColor: string;
  color: string;
  label: string;
  type: 'csv' | 'file' | 'image' | 'json' | 'pdf' | 'spreadsheet' | 'text' | 'word';
}

export type DocumentFileIconMeta =
  | (BaseDocumentFileIconMeta & { icon: LucideIcon; iconKind: 'lucide' })
  | (BaseDocumentFileIconMeta & { iconSvg: string; iconKind: 'svg' });

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

  if (mimeType.includes('json')) {
    return 'JSON';
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
      color: 'red.500',
      iconKind: 'svg',
      iconSvg: pdfFileIconSvg,
      label: 'PDF',
      type: 'pdf',
    };
  }

  if (
    extension === 'doc'
    || extension === 'docx'
    || extension === 'odt'
    || normalizedMimeType.includes('word')
    || normalizedMimeType.includes('opendocument.text')
    || normalizedMimeType.includes('officedocument.wordprocessingml')
  ) {
    return {
      badgeBg: 'bg.info',
      badgeColor: 'blue.fg',
      color: 'blue.500',
      iconKind: 'svg',
      iconSvg: wordFileIconSvg,
      label: extension ? extension.toUpperCase() : 'DOC',
      type: 'word',
    };
  }

  if (extension === 'json' || normalizedMimeType.includes('json')) {
    return {
      badgeBg: 'bg.info',
      badgeColor: 'blue.fg',
      color: 'fg.muted',
      icon: FileJson,
      iconKind: 'lucide',
      label: 'JSON',
      type: 'json',
    };
  }

  if (extension === 'csv' || normalizedMimeType.includes('csv')) {
    return {
      badgeBg: 'bg.warning',
      badgeColor: 'yellow.fg',
      color: 'green.500',
      iconKind: 'svg',
      iconSvg: csvFileIconSvg,
      label: 'CSV',
      type: 'csv',
    };
  }

  if (
    extension === 'xls'
    || extension === 'xlsx'
    || extension === 'ods'
    || normalizedMimeType.includes('spreadsheet')
    || normalizedMimeType.includes('excel')
  ) {
    return {
      badgeBg: 'bg.warning',
      badgeColor: 'yellow.fg',
      color: 'green.500',
      icon: FileSpreadsheet,
      iconKind: 'lucide',
      label: extension ? extension.toUpperCase() : 'XLS',
      type: 'spreadsheet',
    };
  }

  if (
    extension === 'ppt'
    || extension === 'pptx'
    || extension === 'odp'
    || normalizedMimeType.includes('powerpoint')
    || normalizedMimeType.includes('presentation')
  ) {
    return {
      badgeBg: 'orange.subtle',
      badgeColor: 'orange.fg',
      color: 'orange.500',
      icon: FileText,
      iconKind: 'lucide',
      label: extension ? extension.toUpperCase() : 'PPT',
      type: 'file',
    };
  }

  if (
    ['gif', 'jpeg', 'jpg', 'png', 'webp'].includes(extension)
    || normalizedMimeType.startsWith('image/')
  ) {
    return {
      badgeBg: 'bg.success',
      badgeColor: 'green.fg',
      color: 'purple.500',
      icon: FileImage,
      iconKind: 'lucide',
      label: extension ? extension.toUpperCase() : 'IMG',
      type: 'image',
    };
  }

  if (extension === 'md' || normalizedMimeType === 'text/markdown') {
    return {
      badgeBg: 'bg.subtle',
      badgeColor: 'fg.muted',
      color: 'fg.muted',
      icon: File,
      iconKind: 'lucide',
      label: 'MD',
      type: 'file',
    };
  }

  if (extension === 'txt' || normalizedMimeType.startsWith('text/')) {
    return {
      badgeBg: 'bg.info',
      badgeColor: 'blue.fg',
      color: 'fg.muted',
      icon: FileText,
      iconKind: 'lucide',
      label: 'TXT',
      type: 'text',
    };
  }

  return {
    badgeBg: 'bg.subtle',
    badgeColor: 'fg.muted',
    color: 'fg.muted',
    icon: File,
    iconKind: 'lucide',
    label: getDocumentTypeLabel({ name, mimeType }),
    type: 'file',
  };
}
