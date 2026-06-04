import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { Checkbox as ChakraCheckbox, Table, Box, Flex, Text } from '@chakra-ui/react';
import { ROUTES } from '@/app/routes';
import { formatBytes } from '@/features/documents/documents.utils';
import { getFileDisplayName } from '@/features/file-browser/components/vault-browser.types';
import type { SearchResultTag } from '@/features/search/search.types';
import { TagBadge } from '@/features/tags/components/tag-badge';
import { formatShortDate } from '@/lib/localization';
import { DocumentFileIcon } from './document-file-icon';
import { getDocumentSelectionKey } from './document-library-utils';

export interface DocumentLibraryItem {
  documentId: string;
  vaultId: string;
  name: string;
  mimeType: string;
  originalName?: string;
  originalSize: number;
  createdAt: string;
  updatedAt: string;
  tags?: SearchResultTag[];
  snippet?: ReactNode;
  documentLink?: string;
}

function formatDateOnly(value: string | null) {
  return formatShortDate(value);
}

const tableCellLinkStyle = {
  display: 'block',
  padding: 'var(--arkivra-rowPaddingY, 0.875rem) var(--arkivra-controlPaddingX, 0.75rem)',
  color: 'inherit',
  textDecoration: 'none',
} as const;

function VisibleTags({ tags = [] }: { tags?: SearchResultTag[] }) {
  if (tags.length === 0) {
    return <Text as="span" fontSize="sm" color="fg.muted">&mdash;</Text>;
  }

  const visibleTags = tags.slice(0, 2);
  const remainingCount = tags.length - visibleTags.length;

  return (
    <>
      {visibleTags.map((tag) => (
        <TagBadge key={tag.id} name={tag.name} color={tag.color} />
      ))}
      {remainingCount > 0 ? (
        <Box
          as="span"
          display="inline-flex"
          h="8"
          alignItems="center"
          rounded="md"
          bg="bg.subtle"
          px="2.5"
          fontSize="sm"
          fontWeight="semibold"
          color="fg.muted"
        >
          +{remainingCount}
        </Box>
      ) : null}
    </>
  );
}

function SelectionCheckbox({
  checked,
  label,
  onCheckedChange,
}: {
  checked: boolean | 'indeterminate';
  label: string;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <ChakraCheckbox.Root
      size="sm"
      checked={checked}
      aria-label={label}
      onCheckedChange={(event) => onCheckedChange(event.checked === true)}
    >
      <ChakraCheckbox.HiddenInput />
      <ChakraCheckbox.Control>
        <ChakraCheckbox.Indicator />
      </ChakraCheckbox.Control>
    </ChakraCheckbox.Root>
  );
}

export function DocumentLibraryTable({
  documents,
  vaultName,
  selectable = true,
  selectedDocumentKeys,
  onToggleDocument,
  onToggleAllDocuments,
}: {
  documents: DocumentLibraryItem[];
  vaultName: string;
  selectable?: boolean;
  selectedDocumentKeys: string[];
  onToggleDocument: (selectionKey: string, checked: boolean) => void;
  onToggleAllDocuments: (selectionKeys: string[], checked: boolean) => void;
}) {
  const documentKeys = documents.map((document) =>
    getDocumentSelectionKey(document.vaultId, document.documentId),
  );
  const selectedCount = documentKeys.filter((key) => selectedDocumentKeys.includes(key)).length;
  const allSelected = documentKeys.length > 0 && selectedCount === documentKeys.length;
  const indeterminate = selectedCount > 0 && !allSelected;

  return (
    <Table.ScrollArea>
      <Table.Root
        size="sm"
        variant="line"
        interactive
        textStyle="table"
        css={{
          '& thead th': {
            paddingBlock: 'var(--arkivra-listHeaderPaddingY, 0.75rem)',
            color: 'var(--chakra-colors-fg-subtle)',
            fontWeight: '500',
            borderColor: 'var(--chakra-colors-border-surface)',
          },
          '& tbody tr': {
            height: 'var(--arkivra-listRowHeight, 4.5rem)',
            borderColor: 'var(--chakra-colors-border-divider)',
          },
          '& tbody td': {
            paddingBlock: '0',
            borderColor: 'var(--chakra-colors-border-divider)',
          },
          '& tbody tr:last-of-type td': {
            borderBottomWidth: '0',
          },
          '& [data-selected]': {
            background: 'var(--chakra-colors-bg-subtle)',
            borderColor: 'var(--chakra-colors-teal-muted)',
          },
        }}
      >
        <Table.Header>
          <Table.Row>
            {selectable ? (
              <Table.ColumnHeader w="10">
                <SelectionCheckbox
                  checked={indeterminate ? 'indeterminate' : allSelected}
                  label={`Select all documents in ${vaultName}`}
                  onCheckedChange={(checked) => onToggleAllDocuments(documentKeys, checked)}
                />
              </Table.ColumnHeader>
            ) : null}
            <Table.ColumnHeader minW="260px">Name</Table.ColumnHeader>
            <Table.ColumnHeader minW="132px">Uploaded</Table.ColumnHeader>
            <Table.ColumnHeader minW="88px">Size</Table.ColumnHeader>
            <Table.ColumnHeader minW="132px">Tags</Table.ColumnHeader>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {documents.map((document) => {
            const detailLink = document.documentLink ?? ROUTES.vaultDocument(document.vaultId, document.documentId);
            const selectionKey = getDocumentSelectionKey(document.vaultId, document.documentId);
            const isSelected = selectedDocumentKeys.includes(selectionKey);

            return (
              <Table.Row
                key={document.documentId}
                data-selected={isSelected ? '' : undefined}
              >
                {selectable ? (
                  <Table.Cell verticalAlign="top" w="10" onClick={(event) => event.stopPropagation()}>
                    <SelectionCheckbox
                      checked={isSelected}
                      label={`Select ${document.name}`}
                      onCheckedChange={(checked) => onToggleDocument(selectionKey, checked)}
                    />
                  </Table.Cell>
                ) : null}
                <Table.Cell verticalAlign="top" p="0">
                  <Link
                    to={detailLink}
                    style={{
                      minWidth: 0,
                      ...tableCellLinkStyle,
                    }}
                  >
                    <Flex align="flex-start" gap="3" minW="0">
                      <DocumentFileIcon name={document.name} mimeType={document.mimeType} boxSize="9" iconSize={24} />
                      <Box minW="0">
                        <Text
                          truncate
                          fontSize="sm"
                          fontWeight="semibold"
                          color="fg"
                          transition="colors"
                          _hover={{ color: 'teal.solid' }}
                        >
                          {getFileDisplayName(document.name)}
                        </Text>
                        {document.originalName && document.originalName !== document.name ? (
                          <Text mt="1" truncate fontSize="sm" color="fg.muted">
                            {getFileDisplayName(document.originalName)}
                          </Text>
                        ) : null}
                        {document.snippet ? (
                          <Text mt="2" fontSize="sm" lineHeight="6" color="fg.muted">
                            {document.snippet}
                          </Text>
                        ) : null}
                      </Box>
                    </Flex>
                  </Link>
                </Table.Cell>
                <Table.Cell verticalAlign="top" p="0">
                  <Link
                    to={detailLink}
                    style={tableCellLinkStyle}
                  >
                    <Text fontSize="sm" color="fg">
                      {formatDateOnly(document.createdAt)}
                    </Text>
                  </Link>
                </Table.Cell>
                <Table.Cell verticalAlign="top" p="0">
                  <Link
                    to={detailLink}
                    style={tableCellLinkStyle}
                  >
                    <Text fontSize="sm" color="fg">
                      {formatBytes(document.originalSize)}
                    </Text>
                  </Link>
                </Table.Cell>
                <Table.Cell verticalAlign="top" p="0">
                  <Link
                    to={detailLink}
                    style={tableCellLinkStyle}
                  >
                    <Flex flexWrap="wrap" gap="1.5">
                      <VisibleTags tags={document.tags} />
                    </Flex>
                  </Link>
                </Table.Cell>
              </Table.Row>
            );
          })}
        </Table.Body>
      </Table.Root>
    </Table.ScrollArea>
  );
}
