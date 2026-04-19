import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Download, Ellipsis, File, FolderOpen, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { formatBytes, formatDate } from '@/features/documents/documents.utils';
import type { SearchResultTag } from '@/features/search/search.types';

function TagPill({
  name,
  color,
}: {
  name: string;
  color: string | null;
}) {
  return (
    <span
      className="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold tracking-[0.01em]"
      style={{
        backgroundColor: color ? `${color}18` : undefined,
        color: color ?? undefined,
      }}
    >
      {name}
    </span>
  );
}

function getDocumentTypeLabel({
  name,
  mimeType,
}: {
  name: string;
  mimeType: string;
}) {
  const extension = name.split('.').pop()?.trim().toUpperCase();

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

function getDocumentTypeClasses(label: string) {
  switch (label) {
    case 'PDF':
      return 'bg-rose-50 text-rose-700 ring-rose-200';
    case 'TXT':
      return 'bg-sky-50 text-sky-700 ring-sky-200';
    case 'PNG':
    case 'JPG':
    case 'JPEG':
    case 'WEBP':
    case 'GIF':
    case 'IMG':
      return 'bg-emerald-50 text-emerald-700 ring-emerald-200';
    case 'DOC':
    case 'DOCX':
      return 'bg-indigo-50 text-indigo-700 ring-indigo-200';
    case 'CSV':
    case 'XLS':
    case 'XLSX':
      return 'bg-amber-50 text-amber-700 ring-amber-200';
    default:
      return 'bg-secondary text-primary ring-border/60';
  }
}

function FileTypeIcon({
  name,
  mimeType,
}: {
  name: string;
  mimeType: string;
}) {
  const label = getDocumentTypeLabel({ name, mimeType });

  return (
    <div
      className={`flex size-12 shrink-0 items-center justify-center rounded-2xl ring-1 ${getDocumentTypeClasses(label)}`}
      aria-hidden="true"
    >
      <div className="flex flex-col items-center leading-none">
        <File className="mb-1 size-3.5" />
        <span className="text-[0.62rem] font-extrabold tracking-[0.12em]">{label}</span>
      </div>
    </div>
  );
}

function VisibleTags({ tags = [] }: { tags?: SearchResultTag[] }) {
  if (tags.length === 0) {
    return <span className="text-sm text-muted-foreground">No tags</span>;
  }

  const visibleTags = tags.slice(0, 2);
  const remainingCount = tags.length - visibleTags.length;

  return (
    <>
      {visibleTags.map(tag => (
        <TagPill key={tag.id} name={tag.name} color={tag.color} />
      ))}
      {remainingCount > 0 ? (
        <span className="inline-flex items-center rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-muted-foreground">
          +{remainingCount} more
        </span>
      ) : null}
    </>
  );
}

function MenuLink({
  to,
  icon,
  children,
  onSelect,
}: {
  to: string;
  icon: ReactNode;
  children: ReactNode;
  onSelect: () => void;
}) {
  return (
    <Link
      to={to}
      role="menuitem"
      className="flex w-full items-center gap-3 rounded-[16px] px-3 py-2.5 text-sm font-medium text-muted-foreground transition hover:bg-secondary/70 hover:text-foreground"
      onClick={onSelect}
    >
      <span className="text-primary">{icon}</span>
      <span>{children}</span>
    </Link>
  );
}

function MenuAnchor({
  href,
  icon,
  children,
  onSelect,
}: {
  href: string;
  icon: ReactNode;
  children: ReactNode;
  onSelect: () => void;
}) {
  return (
    <a
      href={href}
      role="menuitem"
      className="flex w-full items-center gap-3 rounded-[16px] px-3 py-2.5 text-sm font-medium text-muted-foreground transition hover:bg-secondary/70 hover:text-foreground"
      onClick={onSelect}
    >
      <span className="text-primary">{icon}</span>
      <span>{children}</span>
    </a>
  );
}

function MenuButton({
  icon,
  children,
  onSelect,
  disabled = false,
}: {
  icon: ReactNode;
  children: ReactNode;
  onSelect: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      className="flex w-full items-center gap-3 rounded-[16px] px-3 py-2.5 text-sm font-medium text-muted-foreground transition hover:bg-secondary/70 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
      onClick={onSelect}
    >
      <span className="text-primary">{icon}</span>
      <span>{children}</span>
    </button>
  );
}

function DocumentActionsMenu({
  documentName,
  documentLink,
  downloadHref,
  onDelete,
  deleteDisabled,
}: {
  documentName: string;
  documentLink: string;
  downloadHref: string;
  onDelete?: () => void;
  deleteDisabled?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (menuRef.current?.contains(event.target as Node)) {
        return;
      }

      setIsOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div ref={menuRef} className="relative">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`Open actions for ${documentName}`}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        className="h-11 w-11 rounded-2xl border border-border/60 bg-background/80 text-muted-foreground shadow-[0_12px_24px_rgba(19,27,46,0.05)] hover:bg-secondary/70 hover:text-foreground"
        onClick={() => setIsOpen(open => !open)}
      >
        <Ellipsis className="size-5" />
      </Button>

      {isOpen ? (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+0.75rem)] z-30 w-56 rounded-[22px] border border-border/70 bg-card p-2 shadow-[0_28px_60px_rgba(16,29,76,0.14)]"
        >
          <MenuLink
            to={documentLink}
            icon={<FolderOpen className="size-4" />}
            onSelect={() => setIsOpen(false)}
          >
            Open document
          </MenuLink>
          <MenuAnchor
            href={downloadHref}
            icon={<Download className="size-4" />}
            onSelect={() => setIsOpen(false)}
          >
            Download
          </MenuAnchor>
          {onDelete ? (
            <MenuButton
              icon={<Trash2 className="size-4" />}
              disabled={deleteDisabled}
              onSelect={() => {
                setIsOpen(false);
                onDelete();
              }}
            >
              Delete
            </MenuButton>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function DocumentLibraryHeader() {
  return (
    <div className="hidden grid-cols-[minmax(0,1.9fr)_160px_120px_180px_76px] gap-5 border-b border-border/70 px-5 py-4 text-sm text-muted-foreground md:grid sm:px-6">
      <span>Name</span>
      <span>Updated</span>
      <span>Size</span>
      <span>Tags</span>
      <span className="text-right">Actions</span>
    </div>
  );
}

export function DocumentLibraryRow({
  name,
  mimeType,
  originalName,
  originalSize,
  createdAt,
  updatedAt,
  tags,
  snippet,
  vaultId,
  documentId,
  onDelete,
  deleteDisabled,
}: {
  name: string;
  mimeType: string;
  originalName?: string;
  originalSize: number;
  createdAt: string;
  updatedAt: string;
  tags?: SearchResultTag[];
  snippet?: ReactNode;
  vaultId: string;
  documentId: string;
  onDelete?: () => void;
  deleteDisabled?: boolean;
}) {
  const documentLink = `/vaults/${vaultId}/documents/${documentId}`;
  const downloadHref = `/api/vaults/${vaultId}/documents/${documentId}/download`;

  return (
    <article className="grid gap-5 px-5 py-5 md:grid-cols-[minmax(0,1.9fr)_160px_120px_180px_76px] md:items-center sm:px-6">
      <div className="flex items-start gap-4">
        <FileTypeIcon name={name} mimeType={mimeType} />
        <div className="min-w-0">
          <Link
            to={documentLink}
            className="block truncate text-2xl font-semibold tracking-[-0.03em] text-foreground transition hover:text-primary"
          >
            {name}
          </Link>
          <p className="mt-1 text-sm text-muted-foreground">
            {originalName && originalName !== name ? `${originalName} - ` : ''}
            Uploaded {formatDate(createdAt)}
          </p>
          {snippet ? (
            <div className="mt-3 text-sm leading-6 text-muted-foreground">
              {snippet}
            </div>
          ) : null}
        </div>
      </div>

      <div className="text-sm text-muted-foreground">
        <p className="vault-label md:hidden">Updated</p>
        <p className="mt-2 text-base text-foreground md:mt-0">
          {formatDate(updatedAt)}
        </p>
      </div>

      <div className="text-sm text-muted-foreground">
        <p className="vault-label md:hidden">Size</p>
        <p className="mt-2 text-base text-foreground md:mt-0">{formatBytes(originalSize)}</p>
      </div>

      <div className="text-sm text-muted-foreground">
        <p className="vault-label md:hidden">Tags</p>
        <div className="mt-2 flex flex-wrap gap-2 md:mt-0">
          <VisibleTags tags={tags} />
        </div>
      </div>

      <div className="flex justify-start md:justify-end">
        <DocumentActionsMenu
          documentName={name}
          documentLink={documentLink}
          downloadHref={downloadHref}
          onDelete={onDelete}
          deleteDisabled={deleteDisabled}
        />
      </div>
    </article>
  );
}
