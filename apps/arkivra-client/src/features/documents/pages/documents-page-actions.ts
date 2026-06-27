import {
  Download,
  Eye,
  FileUp,
  Folder,
  FolderPlus,
  FolderUp,
  History,
  Home,
  Info,
  MessageSquare,
  MoveRight,
  Pencil,
  RotateCw,
  Settings2,
  Tags,
  Trash2,
  Users,
} from 'lucide-react';
import { canManageVaultWorkspace, canUseVaultChat } from '@/features/vaults/vault-permissions';
import type { VaultDetail } from '@/features/vaults/vaults.types';
import type {
  BrowserAction,
  BrowserContextItem,
  BrowserContextMenuEntry,
  BrowserItem,
} from '@/features/file-browser/components/vault-browser.types';

interface DocumentsPageActionOptions {
  aiFeaturesEnabled: boolean;
  canCreateItems: boolean;
  canDeleteItems: boolean;
  canDownloadItems: boolean;
  canManageTags: boolean;
  canUpdateItems: boolean;
  currentFolderId: string | null;
  isDeletePending: boolean;
  vaultId: string;
  vault: VaultDetail | undefined;
  downloadDocument: (documentId: string) => void;
  navigateToDocument: (documentId: string) => void;
  onOpenActivity: () => void;
  onOpenChat: () => void;
  onOpenCreateFolderDialog: (folderId: string | null) => void;
  onOpenDeleteConfirm: (items: BrowserItem[]) => void;
  onOpenInfoDialog: (item: BrowserContextItem) => void;
  onOpenItem: (item: BrowserContextItem) => void;
  onOpenMembers: () => void;
  onOpenMoveDialog: (item: BrowserItem) => void;
  onOpenRenameDialog: (item: BrowserItem) => void;
  onRetryProcessing: (item: BrowserContextItem) => void;
  onOpenSettings: () => void;
  onOpenUploadDirectoryPicker: (folderId: string | null) => void;
  onOpenUploadFilesPicker: (folderId: string | null) => void;
  onOpenVersionsDialog: (item: Extract<BrowserItem, { type: 'document' }>) => void;
}

function getDocumentsPageBackgroundContextMenuEntries({
  aiFeaturesEnabled,
  canCreateItems,
  canUpdateItems,
  currentFolderId,
  vault,
  vaultId,
  onOpenActivity,
  onOpenChat,
  onOpenCreateFolderDialog,
  onOpenMembers,
  onRetryProcessing,
  onOpenSettings,
  onOpenUploadDirectoryPicker,
  onOpenUploadFilesPicker,
}: DocumentsPageActionOptions): BrowserContextMenuEntry[] {
  const entries: BrowserContextMenuEntry[] = [
    { key: 'vault-name', type: 'header', label: vault?.name ?? 'Vault' },
    { key: 'after-vault-name', type: 'separator' },
  ];
  const uploadEntries: BrowserContextMenuEntry[] = canCreateItems
    ? [
        {
          key: 'new-folder',
          label: 'New folder',
          icon: FolderPlus,
          onSelect: () => onOpenCreateFolderDialog(currentFolderId),
        },
        { key: 'after-new-folder', type: 'separator' } satisfies BrowserContextMenuEntry,
        {
          key: 'upload-files',
          label: 'Upload files',
          icon: FileUp,
          onSelect: () => onOpenUploadFilesPicker(currentFolderId),
        },
        {
          key: 'upload-directory',
          label: 'Upload folder',
          icon: FolderUp,
          onSelect: () => onOpenUploadDirectoryPicker(currentFolderId),
        },
      ]
    : [];
  const adminSectionEntries: BrowserAction[] = canManageVaultWorkspace(vault)
    ? [
        {
          key: 'members',
          label: 'Members',
          icon: Users,
          onSelect: onOpenMembers,
        },
        {
          key: 'settings',
          label: 'Settings',
          icon: Settings2,
          onSelect: onOpenSettings,
        },
        {
          key: 'activity',
          label: 'Activity',
          icon: History,
          onSelect: onOpenActivity,
        },
      ]
    : [];
  const chatEntry: BrowserAction[] =
    aiFeaturesEnabled && canUseVaultChat(vault)
      ? [
          {
            key: 'chat',
            label: 'Chat',
            icon: MessageSquare,
            onSelect: onOpenChat,
          },
        ]
      : [];
  const workspaceEntries = [...adminSectionEntries, ...chatEntry];
  const retryEntries: BrowserAction[] = canUpdateItems
    ? [
        {
          key: 'retry-processing',
          label: 'Retry failed parsing',
          icon: RotateCw,
          onSelect: () =>
            onRetryProcessing({
              type: 'background',
              vaultId,
              folderId: currentFolderId,
              name: currentFolderId === null ? 'Vault root' : 'Folder',
            }),
        },
      ]
    : [];

  entries.push(...uploadEntries);

  if (retryEntries.length > 0) {
    if (uploadEntries.length > 0) {
      entries.push({ key: 'after-retry-upload', type: 'separator' });
    }
    entries.push(...retryEntries);
  }

  if (workspaceEntries.length > 0) {
    if (uploadEntries.length > 0 || retryEntries.length > 0) {
      entries.push({ key: 'after-upload', type: 'separator' });
    }
    entries.push(...workspaceEntries);
  }

  return entries;
}

function getDocumentsPageItemActions(
  item: BrowserContextItem,
  options: DocumentsPageActionOptions,
): BrowserAction[] {
  const {
    canCreateItems,
    canDeleteItems,
    canDownloadItems,
    canManageTags,
    canUpdateItems,
    currentFolderId,
    isDeletePending,
    downloadDocument,
    navigateToDocument,
    onOpenCreateFolderDialog,
    onOpenDeleteConfirm,
    onOpenInfoDialog,
    onOpenItem,
    onOpenMoveDialog,
    onOpenRenameDialog,
    onRetryProcessing,
    onOpenUploadDirectoryPicker,
    onOpenUploadFilesPicker,
    onOpenVersionsDialog,
  } = options;

  if (item.type === 'root') {
    return [
      {
        key: 'open',
        label: 'Open root',
        icon: Home,
        disabled: currentFolderId === null,
        onSelect: () => onOpenItem(item),
      },
      {
        key: 'new-folder',
        label: 'New folder',
        icon: FolderPlus,
        disabled: !canCreateItems,
        onSelect: () => onOpenCreateFolderDialog(null),
      },
      {
        key: 'upload-files',
        label: 'Upload',
        icon: FileUp,
        disabled: !canCreateItems,
        onSelect: () => onOpenUploadFilesPicker(null),
      },
      {
        key: 'upload-directory',
        label: 'Upload folder',
        icon: FolderUp,
        disabled: !canCreateItems,
        onSelect: () => onOpenUploadDirectoryPicker(null),
      },
      {
        key: 'retry-processing',
        label: 'Retry failed parsing',
        icon: RotateCw,
        disabled: !canUpdateItems,
        onSelect: () => onRetryProcessing(item),
      },
      { key: 'info', label: 'Info', icon: Info, onSelect: () => onOpenInfoDialog(item) },
    ];
  }

  if (item.type === 'background') {
    return [
      {
        key: 'new-folder',
        label: 'New folder',
        icon: FolderPlus,
        disabled: !canCreateItems,
        onSelect: () => onOpenCreateFolderDialog(currentFolderId),
      },
      {
        key: 'upload-files',
        label: 'Upload files',
        icon: FileUp,
        disabled: !canCreateItems,
        onSelect: () => onOpenUploadFilesPicker(currentFolderId),
      },
      {
        key: 'upload-directory',
        label: 'Upload folder',
        icon: FolderUp,
        disabled: !canCreateItems,
        onSelect: () => onOpenUploadDirectoryPicker(currentFolderId),
      },
    ];
  }

  if (item.type === 'folder') {
    return [
      { key: 'open', label: 'Open', icon: Folder, onSelect: () => onOpenItem(item) },
      {
        key: 'rename',
        label: 'Rename',
        icon: Pencil,
        disabled: !canUpdateItems,
        onSelect: () => onOpenRenameDialog(item),
      },
      {
        key: 'move',
        label: 'Move to',
        icon: MoveRight,
        disabled: !canUpdateItems,
        onSelect: () => onOpenMoveDialog(item),
      },
      {
        key: 'retry-processing',
        label: 'Retry failed parsing',
        icon: RotateCw,
        disabled: !canUpdateItems,
        onSelect: () => onRetryProcessing(item),
      },
      { key: 'info', label: 'Info', icon: Info, onSelect: () => onOpenInfoDialog(item) },
      {
        key: 'trash',
        label: 'Trash',
        icon: Trash2,
        tone: 'destructive',
        disabled: !canDeleteItems || isDeletePending,
        onSelect: () => onOpenDeleteConfirm([item]),
      },
    ];
  }

  return [
    { key: 'open', label: 'Preview/open', icon: Eye, onSelect: () => onOpenItem(item) },
    {
      key: 'download',
      label: 'Download',
      icon: Download,
      disabled: !canDownloadItems,
      onSelect: () => downloadDocument(item.document.id),
    },
    {
      key: 'versions',
      label: 'Versions',
      icon: History,
      onSelect: () => onOpenVersionsDialog(item),
    },
    {
      key: 'retry-processing',
      label: 'Retry parsing',
      icon: RotateCw,
      disabled: !canUpdateItems || item.document.processingStatus !== 'failed',
      onSelect: () => onRetryProcessing(item),
    },
    {
      key: 'rename',
      label: 'Rename',
      icon: Pencil,
      disabled: !canUpdateItems,
      onSelect: () => onOpenRenameDialog(item),
    },
    {
      key: 'move',
      label: 'Move to',
      icon: MoveRight,
      disabled: !canUpdateItems,
      onSelect: () => onOpenMoveDialog(item),
    },
    {
      key: 'tags',
      label: 'Tags',
      icon: Tags,
      disabled: !canManageTags,
      onSelect: () => navigateToDocument(item.document.id),
    },
    { key: 'info', label: 'Info', icon: Info, onSelect: () => onOpenInfoDialog(item) },
    {
      key: 'trash',
      label: 'Trash',
      icon: Trash2,
      tone: 'destructive',
      disabled: !canDeleteItems || isDeletePending,
      onSelect: () => onOpenDeleteConfirm([item]),
    },
  ];
}

export function getDocumentsPageContextMenuEntries(
  item: BrowserContextItem,
  options: DocumentsPageActionOptions,
) {
  if (item.type === 'background') {
    return getDocumentsPageBackgroundContextMenuEntries(options);
  }

  return getDocumentsPageItemActions(item, options);
}
