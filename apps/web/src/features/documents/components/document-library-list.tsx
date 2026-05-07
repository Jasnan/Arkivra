import type { ReactNode } from 'react';
import { Download, File, FolderOpen, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Box, Flex, Grid, Text } from '@chakra-ui/react';
import { ActionMenuItemIcon, ActionMenuTriggerButton } from '@/components/ui/action-menu';
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
    <Box
      as="span"
      display="inline-flex"
      alignItems="center"
      rounded="md"
      px="2.5"
      py="1"
      fontSize="xs"
      fontWeight="medium"
      letterSpacing="normal"
      bg={color ? `${color}18` : undefined}
      color={color ?? undefined}
    >
      {name}
    </Box>
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

const typeTokens: Record<string, { bg: string; color: string }> = {
  PDF: { bg: 'status.dangerSubtle', color: 'document.pdf' },
  TXT: { bg: 'status.infoSubtle', color: 'document.text' },
  IMG: { bg: 'status.successSubtle', color: 'document.image' },
  DOC: { bg: 'accent.subtle', color: 'document.office' },
  XLS: { bg: 'status.warningSubtle', color: 'document.sheet' },
};

function getDocumentTypeTokens(label: string) {
  const mappedKey =
    ['PNG', 'JPG', 'JPEG', 'WEBP', 'GIF'].includes(label) ? 'IMG'
    : ['CSV', 'XLS', 'XLSX'].includes(label) ? 'XLS'
    : ['DOC', 'DOCX'].includes(label) ? 'DOC'
    : label;
  return typeTokens[mappedKey] ?? { bg: 'surface.subtle', color: 'document.generic' };
}

function FileTypeIcon({ name, mimeType }: { name: string; mimeType: string }) {
  const label = getDocumentTypeLabel({ name, mimeType });
  const tokens = getDocumentTypeTokens(label);

  return (
    <Flex
      boxSize="10"
      shrink={0}
      align="center"
      justify="center"
      rounded="lg"
      bg={tokens.bg}
      color={tokens.color}
      aria-hidden="true"
      {...{ outline: '1px solid', outlineColor: 'border.subtle' } as any}
    >
      <Flex direction="column" align="center" lineHeight="none">
        <File size={14} style={{ marginBottom: '2px' }} />
        <Text as="span" fontSize="0.6rem" fontWeight="bold" letterSpacing="normal">
          {label}
        </Text>
      </Flex>
    </Flex>
  );
}

function VisibleTags({ tags = [] }: { tags?: SearchResultTag[] }) {
  if (tags.length === 0) {
    return <Text as="span" fontSize="sm" color="text.muted">&mdash;</Text>;
  }

  const visibleTags = tags.slice(0, 2);
  const remainingCount = tags.length - visibleTags.length;

  return (
    <>
      {visibleTags.map((tag) => (
        <TagPill key={tag.id} name={tag.name} color={tag.color} />
      ))}
      {remainingCount > 0 ? (
        <Box
          as="span"
          display="inline-flex"
          alignItems="center"
          rounded="md"
          bg="surface.subtle"
          px="2.5"
          py="1"
          fontSize="xs"
          fontWeight="medium"
          color="text.muted"
        >
          +{remainingCount}
        </Box>
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
        <ActionMenuTriggerButton label={`Open actions for ${documentName}`} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" minW="56">
        <DropdownMenuItem asChild>
          <Link to={documentLink}>
            <ActionMenuItemIcon icon={FolderOpen} />
            Open document
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={downloadHref}>
            <ActionMenuItemIcon icon={Download} />
            Download
          </a>
        </DropdownMenuItem>
        {onDelete ? (
          <DropdownMenuItem disabled={deleteDisabled} onSelect={onDelete}>
            <ActionMenuItemIcon icon={Trash2} tone="destructive" />
            Move to trash
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function DocumentLibraryHeader() {
  return (
    <Grid
      templateColumns="minmax(0,1.9fr) 160px 120px 180px 76px"
      gap="5"
      borderBottomWidth="1px"
      borderColor="border.subtle"
      px={{ base: '5', sm: '6' }}
      py="4"
      fontSize="sm"
      color="text.muted"
      display={{ base: 'none', md: 'grid' }}
    >
      <Text>Name</Text>
      <Text>Uploaded</Text>
      <Text>Size</Text>
      <Text>Tags</Text>
      <Text textAlign="right">Actions</Text>
    </Grid>
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
  documentLink,
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
  documentLink?: string;
  onDelete?: () => void;
  deleteDisabled?: boolean;
}) {
  const detailLink = documentLink ?? `/vaults/${vaultId}/documents/${documentId}`;
  const downloadHref = `/api/vaults/${vaultId}/documents/${documentId}/download`;

  return (
    <Grid
      templateColumns={{ base: '1fr', md: 'minmax(0,1.9fr) 160px 120px 180px 76px' }}
      gap="5"
      px={{ base: '5', sm: '6' }}
      py="5"
      alignItems={{ md: 'center' }}
    >
      <Flex align="flex-start" gap="4">
        <FileTypeIcon name={name} mimeType={mimeType} />
        <Box minW="0">
          <Link
            to={detailLink}
            style={{ display: 'block', color: 'inherit', textDecoration: 'none' }}
          >
            <Text
              truncate
              fontSize="base"
              fontWeight="semibold"
              color="text.default"
              transition="colors"
              _hover={{ color: 'accent.default' }}
            >
              {name}
            </Text>
          </Link>
          {originalName && originalName !== name ? (
            <Text mt="1" fontSize="sm" color="text.muted">{originalName}</Text>
          ) : null}
          {snippet ? (
            <Text mt="3" fontSize="sm" lineHeight="6" color="text.muted">{snippet}</Text>
          ) : null}
        </Box>
      </Flex>

      <Box fontSize="sm" color="text.muted">
        <Text
          textStyle="label"
          display={{ md: 'none' }}
        >
          Uploaded
        </Text>
        <Text mt={{ base: '2', md: '0' }} fontSize="sm" color="text.default">
          {formatDate(createdAt)}
        </Text>
      </Box>

      <Box fontSize="sm" color="text.muted">
        <Text
          textStyle="label"
          display={{ md: 'none' }}
        >
          Size
        </Text>
        <Text mt={{ base: '2', md: '0' }} fontSize="sm" color="text.default">
          {formatBytes(originalSize)}
        </Text>
      </Box>

      <Box fontSize="sm" color="text.muted">
        <Text
          textStyle="label"
          display={{ md: 'none' }}
        >
          Tags
        </Text>
        <Flex mt={{ base: '2', md: '0' }} flexWrap="wrap" gap="2">
          <VisibleTags tags={tags} />
        </Flex>
      </Box>

      <Flex justify={{ base: 'flex-start', md: 'flex-end' }}>
        <DocumentActionsMenu
          documentName={name}
          documentLink={detailLink}
          downloadHref={downloadHref}
          onDelete={onDelete}
          deleteDisabled={deleteDisabled}
        />
      </Flex>
    </Grid>
  );
}
