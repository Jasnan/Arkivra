import type { ComponentType } from 'react';
import { Download, Printer, RotateCcw, Trash2 } from 'lucide-react';
import { ActionMenuItemIcon, ActionMenuTriggerButton } from '@/components/ui/action-menu';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { getDocumentDownloadUrl } from '@/features/documents/documents.api';

const documentActionTriggerStyles = {
  h: '10',
  w: '10',
  rounded: 'md',
  borderColor: 'border.surface',
  bg: 'bg.surface',
  color: 'fg.muted',
  shadow: 'none',
  _hover: { borderColor: 'fg/30', bg: 'bg.surface', color: 'fg' },
  _focusVisible: {
    borderColor: 'teal.solid',
    outline: '2px solid',
    outlineColor: 'teal.focusRing',
    outlineOffset: '1px',
  },
} as const;

export interface DocumentSectionMenuItem {
  key: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  route: string;
}

export function DocumentActionMenu({
  documentName,
  vaultId,
  documentId,
  isDeleted,
  isTrashDocumentRoute,
  canPrint,
  sectionMenuItems,
  isRestorePending,
  isDeletePending,
  onNavigateToSection,
  onPrint,
  onRestore,
  onOpenDeleteDialog,
}: {
  documentName: string;
  vaultId: string;
  documentId: string;
  isDeleted: boolean;
  isTrashDocumentRoute: boolean;
  canPrint: boolean;
  sectionMenuItems: DocumentSectionMenuItem[];
  isRestorePending: boolean;
  isDeletePending: boolean;
  onNavigateToSection: (route: string) => void;
  onPrint: () => void;
  onRestore: () => void;
  onOpenDeleteDialog: () => void;
}) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <ActionMenuTriggerButton
          label={`Open actions for ${documentName}`}
          {...documentActionTriggerStyles}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" minW="56">
        {sectionMenuItems.map((item) => (
          <DropdownMenuItem
            key={item.key}
            value={item.key}
            onSelect={() => onNavigateToSection(item.route)}
          >
            <ActionMenuItemIcon icon={item.icon} />
            {item.label}
          </DropdownMenuItem>
        ))}
        {sectionMenuItems.length > 0 ? <DropdownMenuSeparator /> : null}
        {!isTrashDocumentRoute ? (
          <DropdownMenuItem value="download-original" asChild>
            <a href={getDocumentDownloadUrl({ vaultId, documentId })}>
              <ActionMenuItemIcon icon={Download} />
              Download
            </a>
          </DropdownMenuItem>
        ) : null}
        {canPrint ? (
          <DropdownMenuItem value="print" onSelect={onPrint}>
            <ActionMenuItemIcon icon={Printer} />
            Print
          </DropdownMenuItem>
        ) : null}
        {!isTrashDocumentRoute || isDeleted ? <DropdownMenuSeparator /> : null}
        {isDeleted ? (
          <DropdownMenuItem
            value="restore-document"
            disabled={isRestorePending}
            onSelect={onRestore}
          >
            <ActionMenuItemIcon icon={RotateCcw} />
            {isRestorePending ? 'Restoring...' : 'Restore'}
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem
            value="move-to-trash"
            color="fg.error"
            _hover={{ bg: 'bg.error', color: 'fg.error' }}
            _focus={{ bg: 'bg.error', color: 'fg.error' }}
            disabled={isDeletePending}
            onSelect={onOpenDeleteDialog}
          >
            <ActionMenuItemIcon icon={Trash2} tone="destructive" />
            Trash
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
