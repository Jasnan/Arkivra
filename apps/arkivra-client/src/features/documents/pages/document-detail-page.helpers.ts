import type { SearchRouteSearch, VaultWorkspaceSearch } from '@/app/search-params';
import { ROUTES } from '@/app/routes';
import type { DocumentPreviewKind } from '@/features/documents/components/detail/document-preview-section';
import type { UploadConflictStrategy } from '@/features/documents/documents.api';
import type {
  DocumentDetail,
  DerivedPreviewStatus,
  DocumentLanguageMetadata,
  DocumentVersionDetail,
} from '@/features/documents/documents.types';
import type { Tag } from '@/features/tags/tags.types';
import { canUseVaultChat } from '@/features/vaults/vault-permissions';
import type { VaultDetail } from '@/features/vaults/vaults.types';
import { History, Image as ImageIcon, MessageSquare, ScanText, Tags } from 'lucide-react';

type PreviewKind = DocumentPreviewKind;
export type DocumentSection = 'preview' | 'content' | 'metadata' | 'activity';

const searchReturnParamKeys = [
  'q',
  'vaultId',
  'vaultIds',
  'tagId',
  'tagIds',
  'dateFrom',
  'dateTo',
  'sortBy',
  'searchMode',
] as const;
const documentFileExtensionPattern = /\.[^/.]+$/;
const browserImagePreviewExtensions = new Set(['gif', 'jpeg', 'jpg', 'png', 'webp']);

export function getDocumentLanguageLabel(language: DocumentLanguageMetadata | null | undefined) {
  if (language === null || language === undefined) {
    return 'Unknown';
  }

  return language.name || language.code.toUpperCase();
}

export function getDocumentTitle(name: string) {
  return name.replace(documentFileExtensionPattern, '');
}

export function getDocumentFileTypeLabel(mimeType: string) {
  if (mimeType === 'application/pdf') {
    return 'PDF document';
  }

  if (mimeType.startsWith('image/')) {
    return 'Image file';
  }

  if (mimeType.startsWith('text/')) {
    return 'Text document';
  }

  return 'Document';
}

export function getSearchReturnParams(search: VaultWorkspaceSearch): SearchRouteSearch | null {
  if (search.source !== 'search') {
    return null;
  }

  const params: SearchRouteSearch = {};

  for (const key of searchReturnParamKeys) {
    const value = search[key];
    if (typeof value === 'string' && value.length > 0) {
      Object.assign(params, { [key]: value });
    }
  }

  return params;
}

function isMarkdownDocument({
  mimeType,
  name,
  originalName,
}: {
  mimeType: string;
  name: string;
  originalName: string;
}) {
  const normalizedMimeType = mimeType.toLowerCase();
  const normalizedNames = [name, originalName].map((value) => value.toLowerCase());

  return (
    normalizedMimeType === 'text/markdown' ||
    normalizedMimeType === 'text/x-markdown' ||
    normalizedMimeType === 'application/markdown' ||
    normalizedMimeType === 'application/x-markdown' ||
    normalizedNames.some(
      (normalizedName) =>
        normalizedName.endsWith('.md') ||
        normalizedName.endsWith('.markdown') ||
        normalizedName.endsWith('.mdown') ||
        normalizedName.endsWith('.mkd'),
    )
  );
}

function getDocumentFileExtension(name: string) {
  const extension = name.split('.').pop()?.trim().toLowerCase();
  return extension && extension !== name.trim().toLowerCase() ? extension : '';
}

function isImageDocument({
  mimeType,
  name,
  originalName,
}: {
  mimeType: string;
  name: string;
  originalName: string;
}) {
  if (mimeType.toLowerCase().startsWith('image/')) {
    return true;
  }

  return [name, originalName].some((value) =>
    browserImagePreviewExtensions.has(getDocumentFileExtension(value)),
  );
}

export function getPreviewKind(
  mimeType: string,
  name: string,
  originalName: string,
  hasPreviewPdf = false,
  derivedPreviewStatus?: DerivedPreviewStatus,
): PreviewKind {
  if (hasPreviewPdf || derivedPreviewStatus === 'ready') {
    return 'pdf';
  }

  if (mimeType === 'application/pdf') {
    return 'pdf';
  }

  if (isImageDocument({ mimeType, name, originalName })) {
    return 'image';
  }

  if (isMarkdownDocument({ mimeType, name, originalName })) {
    return 'markdown';
  }

  if (mimeType.startsWith('text/')) {
    return 'text';
  }

  if (derivedPreviewStatus === 'pending') {
    return 'pending';
  }

  if (derivedPreviewStatus === 'failed') {
    return 'failed';
  }

  return 'unsupported';
}

export function conflictStrategyLabel(strategy: UploadConflictStrategy) {
  switch (strategy) {
    case 'skip':
      return 'Skip';
    case 'keep_both':
      return 'Keep both';
    case 'new_version':
      return 'New version';
    default:
      return strategy;
  }
}

export function getDocumentSectionMenuItems({
  aiFeaturesEnabled,
  canShowExtractedTextTab,
  documentId,
  documentName,
  isTrashDocumentRoute,
  vault,
  vaultId,
}: {
  aiFeaturesEnabled: boolean;
  canShowExtractedTextTab: boolean;
  documentId: string;
  documentName: string;
  isTrashDocumentRoute: boolean;
  vault: VaultDetail | undefined;
  vaultId: string;
}) {
  if (isTrashDocumentRoute) {
    return [];
  }

  return [
    {
      key: 'preview',
      label: 'Preview',
      icon: ImageIcon,
      route: ROUTES.vaultDocument(vaultId, documentId),
    },
    ...(canShowExtractedTextTab
      ? [
          {
            key: 'content',
            label: 'Text & chunks',
            icon: ScanText,
            route: ROUTES.vaultDocumentExtractedText(vaultId, documentId),
          },
        ]
      : []),
    {
      key: 'metadata',
      label: 'Metadata',
      icon: Tags,
      route: ROUTES.vaultDocumentMetadata(vaultId, documentId),
    },
    {
      key: 'activity',
      label: 'Activity',
      icon: History,
      route: ROUTES.vaultDocumentActivity(vaultId, documentId),
    },
    ...(aiFeaturesEnabled && canUseVaultChat(vault)
      ? [
          {
            key: 'chat',
            label: 'Chat',
            icon: MessageSquare,
            route: ROUTES.chatWithDocument(vaultId, documentId, documentName),
          },
        ]
      : []),
  ];
}

export function printDocumentPreview({
  canPrint,
  documentName,
  inlineFileUrl,
  previewKind,
  onPrintWindowError,
}: {
  canPrint: boolean;
  documentName: string;
  inlineFileUrl: string;
  previewKind: PreviewKind;
  onPrintWindowError: () => void;
}) {
  if (!canPrint) {
    return;
  }

  if (previewKind === 'pdf' || previewKind === 'text') {
    const frame = window.document.createElement('iframe');
    frame.style.position = 'fixed';
    frame.style.right = '0';
    frame.style.bottom = '0';
    frame.style.width = '0';
    frame.style.height = '0';
    frame.style.border = '0';
    frame.src = inlineFileUrl;
    frame.onload = () => {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
    };
    window.document.body.appendChild(frame);
    window.setTimeout(() => {
      frame.remove();
    }, 60_000);
    return;
  }

  if (previewKind === 'image') {
    const printWindow = window.open('', '_blank', 'noopener,noreferrer');

    if (printWindow === null) {
      onPrintWindowError();
      return;
    }

    printWindow.document.write(`
        <html>
          <head>
            <title>${documentName}</title>
            <style>
              body {
                margin: 0;
                display: flex;
                min-height: 100vh;
                align-items: center;
                justify-content: center;
                background: white;
              }
              img {
                max-width: 100%;
                max-height: 100vh;
                object-fit: contain;
              }
            </style>
          </head>
          <body>
            <img src="${inlineFileUrl}" alt="${documentName}" />
          </body>
        </html>
      `);
    printWindow.document.close();
    printWindow.onload = () => {
      printWindow.focus();
      printWindow.print();
    };
  }
}

export function getDocumentTagPickerState({
  assignedTags,
  availableTags,
  searchValue,
}: {
  assignedTags: Tag[];
  availableTags: Tag[];
  searchValue: string;
}) {
  const normalizedSearchValue = searchValue.trim().toLowerCase();
  const filteredAvailableTags = availableTags.filter((tag) => {
    if (normalizedSearchValue.length === 0) {
      return true;
    }

    return tag.name.toLowerCase().includes(normalizedSearchValue);
  });
  const sortedFilteredAvailableTags = [...filteredAvailableTags].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  const selectedMatchingTags = [...assignedTags]
    .filter((tag) => {
      if (normalizedSearchValue.length === 0) {
        return true;
      }

      return tag.name.toLowerCase().includes(normalizedSearchValue);
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  const hasExactTagMatch = availableTags.some(
    (tag) => tag.name.trim().toLowerCase() === normalizedSearchValue,
  );

  return {
    hasExactTagMatch,
    normalizedSearchValue,
    selectedMatchingTags,
    sortedFilteredAvailableTags,
  };
}

export function getActiveDocumentDetail({
  document,
  selectedVersionDetail,
}: {
  document: DocumentDetail;
  selectedVersionDetail: DocumentVersionDetail | null;
}) {
  if (selectedVersionDetail === null) {
    return document;
  }

  return {
    ...document,
    originalName: selectedVersionDetail.originalName,
    originalSize: selectedVersionDetail.originalSize,
    originalSha256Hash: selectedVersionDetail.originalSha256Hash,
    mimeType: selectedVersionDetail.mimeType,
    processingStatus: selectedVersionDetail.processingStatus,
    processingErrorCode: selectedVersionDetail.processingErrorCode,
    processingErrorMessage: selectedVersionDetail.processingErrorMessage,
    processingFailedAt: selectedVersionDetail.processingFailedAt,
    language: selectedVersionDetail.language,
    content: selectedVersionDetail.content,
    displayContent: selectedVersionDetail.rawMarkdown || selectedVersionDetail.content,
    updatedAt: selectedVersionDetail.updatedAt,
    isDeleted: document.isDeleted || selectedVersionDetail.deletedAt !== null,
    deletedAt: document.deletedAt ?? selectedVersionDetail.deletedAt,
  };
}
