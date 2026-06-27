import type { ComponentType, ReactNode } from 'react';
import { useState } from 'react';
import { Download, History, Printer, RotateCcw, RotateCw, Trash2 } from 'lucide-react';
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

function DocumentActionMenuItem({
  value,
  destructive = false,
  disabled,
  onSelect,
  children,
  asChild,
}: {
  value: string;
  destructive?: boolean;
  disabled?: boolean;
  onSelect?: () => void;
  children: ReactNode;
  asChild?: boolean;
}) {
  const [active, setActive] = useState(false);
  const inactiveColor = destructive ? 'fg.error' : 'fg.muted';
  const activeColor = destructive ? 'fg.error' : 'teal.fg';

  return (
    <DropdownMenuItem
      value={value}
      asChild={asChild}
      data-active={active ? 'true' : undefined}
      borderWidth="1px"
      borderColor={active ? 'teal.muted' : 'transparent'}
      bg={active ? 'teal.subtle' : 'transparent'}
      color={active ? activeColor : inactiveColor}
      transition="background-color 120ms ease, border-color 120ms ease, color 120ms ease"
      _hover={{ bg: 'teal.subtle', borderColor: 'teal.muted', color: activeColor }}
      _focus={{ bg: 'teal.subtle', borderColor: 'teal.muted', color: activeColor }}
      _highlighted={{ bg: 'transparent', borderColor: 'transparent', color: inactiveColor }}
      disabled={disabled}
      onPointerEnter={() => setActive(true)}
      onPointerMove={() => setActive(true)}
      onPointerLeave={() => setActive(false)}
      onFocus={() => setActive(true)}
      onBlur={() => setActive(false)}
      onSelect={onSelect}
    >
      {children}
    </DropdownMenuItem>
  );
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
  isRetryProcessingPending,
  canRetryProcessing,
  onNavigateToSection,
  onPrint,
  onOpenVersionsDialog,
  onRestore,
  onRetryProcessing,
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
  isRetryProcessingPending: boolean;
  canRetryProcessing: boolean;
  onNavigateToSection: (route: string) => void;
  onPrint: () => void;
  onOpenVersionsDialog: () => void;
  onRestore: () => void;
  onRetryProcessing: () => void;
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
          <DocumentActionMenuItem
            key={item.key}
            value={item.key}
            onSelect={() => onNavigateToSection(item.route)}
          >
            <ActionMenuItemIcon icon={item.icon} />
            {item.label}
          </DocumentActionMenuItem>
        ))}
        {sectionMenuItems.length > 0 ? <DropdownMenuSeparator /> : null}
        {!isTrashDocumentRoute ? (
          <>
            <DocumentActionMenuItem value="versions" onSelect={onOpenVersionsDialog}>
              <ActionMenuItemIcon icon={History} />
              Versions
            </DocumentActionMenuItem>
            <DocumentActionMenuItem value="download-original" asChild>
              <a href={getDocumentDownloadUrl({ vaultId, documentId })}>
                <ActionMenuItemIcon icon={Download} />
                Download
              </a>
            </DocumentActionMenuItem>
          </>
        ) : null}
        {canPrint ? (
          <DocumentActionMenuItem value="print" onSelect={onPrint}>
            <ActionMenuItemIcon icon={Printer} />
            Print
          </DocumentActionMenuItem>
        ) : null}
        {canRetryProcessing ? (
          <DocumentActionMenuItem
            value="retry-processing"
            disabled={isRetryProcessingPending}
            onSelect={onRetryProcessing}
          >
            <ActionMenuItemIcon icon={RotateCw} />
            {isRetryProcessingPending ? 'Retrying...' : 'Retry parsing'}
          </DocumentActionMenuItem>
        ) : null}
        {!isTrashDocumentRoute || isDeleted ? <DropdownMenuSeparator /> : null}
        {isDeleted ? (
          <DocumentActionMenuItem
            value="restore-document"
            disabled={isRestorePending}
            onSelect={onRestore}
          >
            <ActionMenuItemIcon icon={RotateCcw} />
            {isRestorePending ? 'Restoring...' : 'Restore'}
          </DocumentActionMenuItem>
        ) : (
          <DocumentActionMenuItem
            value="move-to-trash"
            destructive
            disabled={isDeletePending}
            onSelect={onOpenDeleteDialog}
          >
            <ActionMenuItemIcon icon={Trash2} tone="destructive" />
            Trash
          </DocumentActionMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
