import type { ReactNode } from 'react';
import { Download, Ellipsis, File, FolderOpen, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatBytes, formatDate } from '@/features/documents/documents.utils';
import type { SearchResultTag } from '@/features/search/search.types';

function TagPill({ name, color }: { name: string; color: string | null }) {
  return (
    <span
      className="inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium tracking-normal"
      style={{
        backgroundColor: color ? `${color}18` : undefined,
        color: color ?? undefined,
      }}
    >
      {name}
    </span>
  );
}

function getDocumentTypeLabel({ name, mimeType }: { name: string; mimeType: string }) {
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

function FileTypeIcon({ name, mimeType }: { name: string; mimeType: string }) {
  const label = getDocumentTypeLabel({ name, mimeType });

  return (
    <div
      className={`flex size-10 shrink-0 items-center justify-center rounded-lg ring-1 ${getDocumentTypeClasses(label)}`}
      aria-hidden="true"
    >
      <div className="flex flex-col items-center leading-none">
        <File className="mb-0.5 size-3.5" />
        <span className="text-[0.6rem] font-bold tracking-normal">{label}</span>
      </div>
    </div>
  );
}

function VisibleTags({ tags = [] }: { tags?: SearchResultTag[] }) {
  if (tags.length === 0) {
    return <span className="text-sm text-muted-foreground">—</span>;
  }

  const visibleTags = tags.slice(0, 2);
  const remainingCount = tags.length - visibleTags.length;

  return (
    <>
      {visibleTags.map((tag) => (
        <TagPill key={tag.id} name={tag.name} color={tag.color} />
      ))}
      {remainingCount > 0 ? (
        <span className="inline-flex items-center rounded-md bg-secondary px-2.5 py-1 text-xs font-medium text-muted-foreground">
          +{remainingCount}
        </span>
      ) : null}
    </>
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
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Open actions for ${documentName}`}
          className="h-9 w-9 rounded-lg border border-border/60 bg-background/80 text-muted-foreground hover:bg-secondary/70 hover:text-foreground"
        >
          <Ellipsis className="size-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem asChild>
          <Link to={documentLink}>
            <FolderOpen className="size-4 text-primary" />
            Open document
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={downloadHref}>
            <Download className="size-4 text-primary" />
            Download
          </a>
        </DropdownMenuItem>
        {onDelete ? (
          <DropdownMenuItem disabled={deleteDisabled} onSelect={onDelete}>
            <Trash2 className="size-4 text-primary" />
            Delete
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function DocumentLibraryHeader() {
  return (
    <div className="hidden grid-cols-[minmax(0,1.9fr)_160px_120px_180px_76px] gap-5 border-b border-border/70 px-5 py-4 text-sm text-muted-foreground md:grid sm:px-6">
      <span>Name</span>
      <span>Uploaded</span>
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
  updatedAt: _updatedAt,
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
            className="block truncate text-base font-semibold text-foreground transition hover:text-primary"
          >
            {name}
          </Link>
          {originalName && originalName !== name ? (
            <p className="mt-1 text-sm text-muted-foreground">{originalName}</p>
          ) : null}
          {snippet ? (
            <div className="mt-3 text-sm leading-6 text-muted-foreground">{snippet}</div>
          ) : null}
        </div>
      </div>

      <div className="text-sm text-muted-foreground">
        <p className="vault-label md:hidden">Uploaded</p>
        <p className="mt-2 text-sm text-foreground md:mt-0">{formatDate(createdAt)}</p>
      </div>

      <div className="text-sm text-muted-foreground">
        <p className="vault-label md:hidden">Size</p>
        <p className="mt-2 text-sm text-foreground md:mt-0">{formatBytes(originalSize)}</p>
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
