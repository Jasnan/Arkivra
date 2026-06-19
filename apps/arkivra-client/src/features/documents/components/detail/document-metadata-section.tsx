import type { FormEvent } from 'react';
import { Box, Flex, Text, chakra } from '@chakra-ui/react';
import { ClipboardCopy, FileText, Info, Pencil, Search } from 'lucide-react';
import { SaveButton } from '@/components/ui/action-buttons';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { DocumentDetail } from '@/features/documents/documents.types';
import { formatBytes, formatDate } from '@/features/documents/documents.utils';

const editableDocumentLanguages = [
  { value: 'unknown', label: 'Unknown' },
  { value: 'de', label: 'German' },
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
] as const;

type SemanticBadgeTone = 'gray' | 'teal' | 'blue' | 'orange' | 'red';

function getSemanticIndexLabel(document: DocumentDetail) {
  const semanticIndex = document.semanticIndex;

  if (!semanticIndex) {
    return {
      detail: 'No semantic index is available for this document.',
      label: 'Not indexed',
      tone: 'gray' as SemanticBadgeTone,
    };
  }

  const embedded = semanticIndex.embeddedChunkCount.toLocaleString();
  const expected = semanticIndex.expectedChunkCount.toLocaleString();

  if (semanticIndex.documentStatus === 'ready') {
    return {
      detail: `${embedded} / ${expected} chunks indexed.`,
      label: 'Indexed',
      tone: 'teal' as SemanticBadgeTone,
    };
  }

  if (semanticIndex.documentStatus === 'indexing') {
    return {
      detail: `${embedded} / ${expected} chunks indexed.`,
      label: 'Indexing',
      tone: 'blue' as SemanticBadgeTone,
    };
  }

  if (semanticIndex.documentStatus === 'pending') {
    return {
      detail: 'Waiting for indexing.',
      label: 'Pending',
      tone: 'gray' as SemanticBadgeTone,
    };
  }

  if (semanticIndex.documentStatus === 'stale') {
    return {
      detail: 'Document changed and is waiting for reindexing.',
      label: 'Stale',
      tone: 'orange' as SemanticBadgeTone,
    };
  }

  if (semanticIndex.documentStatus === 'failed') {
    return {
      detail: 'Indexing failed.',
      label: 'Failed',
      tone: 'red' as SemanticBadgeTone,
    };
  }

  if (semanticIndex.documentStatus === 'skipped') {
    return {
      detail: 'This document was skipped by semantic indexing.',
      label: 'Skipped',
      tone: 'gray' as SemanticBadgeTone,
    };
  }

  return {
    detail: 'No index record exists for the current document version.',
    label: 'Not indexed',
    tone: 'gray' as SemanticBadgeTone,
  };
}

export function DocumentMetadataSection({
  document,
  documentLanguageLabel,
  documentFileTypeLabel,
  currentName,
  currentLanguage,
  isNameEditing,
  isLanguageEditing,
  isTrashDocumentRoute,
  isMetadataSaving,
  hasNameChanged,
  hasLanguageChanged,
  onNameChange,
  onLanguageChange,
  onEditName,
  onEditLanguage,
  onCopyMetadataValue,
  onSubmit,
}: {
  document: DocumentDetail;
  documentLanguageLabel: string;
  documentFileTypeLabel: string;
  currentName: string;
  currentLanguage: string;
  isNameEditing: boolean;
  isLanguageEditing: boolean;
  isTrashDocumentRoute: boolean;
  isMetadataSaving: boolean;
  hasNameChanged: boolean;
  hasLanguageChanged: boolean;
  onNameChange: (value: string) => void;
  onLanguageChange: (value: string) => void;
  onEditName: () => void;
  onEditLanguage: () => void;
  onCopyMetadataValue: (value: string, label: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const semanticIndex = document.semanticIndex;
  const semanticIndexLabel = getSemanticIndexLabel(document);

  return (
    <chakra.form maxW="6xl" minH="820px" mx="auto" onSubmit={onSubmit}>
      <Flex direction="column" gap="5">
        <Box
          rounded="xl"
          borderWidth="1px"
          borderColor="border.surface"
          bg="bg.subtle"
          px={{ base: '4', md: '6' }}
          py={{ base: '3', md: '4' }}
        >
          <Flex
            direction={{ base: 'column', md: 'row' }}
            align={{ base: 'stretch', md: 'center' }}
            gap={{ base: '2', md: '5' }}
            py="3"
          >
            <Text
              w={{ md: '16rem' }}
              flexShrink={0}
              color="fg.muted"
              fontSize="sm"
              fontWeight="medium"
              textTransform="uppercase"
            >
              Display name
            </Text>
            <Flex flex="1" align="center" gap="3" minW="0">
              {isNameEditing ? (
                <Input
                  id="document-name"
                  type="text"
                  value={currentName}
                  borderColor="border.surface"
                  bg="bg.surface"
                  autoFocus
                  onChange={(event) => onNameChange(event.target.value)}
                />
              ) : (
                <Flex
                  flex="1"
                  minW="0"
                  align="center"
                  minH="12"
                  rounded="lg"
                  borderWidth="1px"
                  borderColor="border.surface"
                  bg="bg.surface"
                  px="4"
                >
                  <Text fontWeight="medium" color="fg" truncate>
                    {document.name}
                  </Text>
                </Flex>
              )}
              {!isTrashDocumentRoute ? (
                <chakra.button
                  type="button"
                  aria-label="Edit display name"
                  display="inline-flex"
                  boxSize="9"
                  flexShrink={0}
                  alignItems="center"
                  justifyContent="center"
                  rounded="lg"
                  color="fg.muted"
                  transition="colors"
                  _hover={{ bg: 'bg.surface', color: 'fg' }}
                  onClick={onEditName}
                >
                  <Pencil size={18} />
                </chakra.button>
              ) : null}
            </Flex>
          </Flex>

          <Flex
            direction={{ base: 'column', md: 'row' }}
            align={{ base: 'stretch', md: 'center' }}
            gap={{ base: '2', md: '5' }}
            py="3"
            borderTopWidth="1px"
            borderColor="border.surface"
          >
            <Text
              w={{ md: '16rem' }}
              flexShrink={0}
              color="fg.muted"
              fontSize="sm"
              fontWeight="medium"
              textTransform="uppercase"
            >
              Source language
            </Text>
            <Flex flex="1" align="center" gap="3" minW="0">
              {isLanguageEditing ? (
                <Select
                  value={currentLanguage}
                  onValueChange={onLanguageChange}
                  positioning={{ sameWidth: true }}
                >
                  <SelectTrigger borderColor="border.surface" bg="bg.surface">
                    <SelectValue placeholder="Select source language" />
                  </SelectTrigger>
                  <SelectContent>
                    {editableDocumentLanguages.map((language) => (
                      <SelectItem key={language.value} value={language.value}>
                        {language.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Flex
                  flex="1"
                  minW="0"
                  align="center"
                  minH="12"
                  rounded="lg"
                  borderWidth="1px"
                  borderColor="border.surface"
                  bg="bg.surface"
                  px="4"
                >
                  <Text fontWeight="medium" color="fg" truncate>
                    {documentLanguageLabel}
                  </Text>
                </Flex>
              )}
              {!isTrashDocumentRoute ? (
                <chakra.button
                  type="button"
                  aria-label="Edit source language"
                  display="inline-flex"
                  boxSize="9"
                  flexShrink={0}
                  alignItems="center"
                  justifyContent="center"
                  rounded="lg"
                  color="fg.muted"
                  transition="colors"
                  _hover={{ bg: 'bg.surface', color: 'fg' }}
                  onClick={onEditLanguage}
                >
                  <Pencil size={18} />
                </chakra.button>
              ) : null}
            </Flex>
          </Flex>
        </Box>

        <Box
          rounded="xl"
          borderWidth="1px"
          borderColor="border.surface"
          bg="bg.subtle"
          px={{ base: '4', md: '6' }}
          py={{ base: '4', md: '5' }}
        >
          <Flex align="center" gap="3" color="fg.muted" mb="4">
            <FileText size={18} />
            <Text
              fontWeight="semibold"
              textTransform="uppercase"
              letterSpacing="wide"
              fontSize="sm"
            >
              File information
            </Text>
          </Flex>
          {[
            ['Original filename', document.originalName],
            ['File type', documentFileTypeLabel],
            ['MIME type', document.mimeType],
            ['File size', formatBytes(document.originalSize)],
          ].map(([label, value], index) => (
            <Flex
              key={label}
              align="center"
              gap="4"
              py="3"
              borderTopWidth={index === 0 ? '1px' : undefined}
              borderBottomWidth={index < 3 ? '1px' : undefined}
              borderColor="border.surface"
            >
              <Text flex="0 0 12rem" color="fg.muted">
                {label}
              </Text>
              <Text flex="1" minW="0" fontWeight="medium" color="fg" truncate>
                {value}
              </Text>
              {label === 'Original filename' ? (
                <chakra.button
                  type="button"
                  aria-label="Copy original filename"
                  display="inline-flex"
                  boxSize="8"
                  flexShrink={0}
                  alignItems="center"
                  justifyContent="center"
                  rounded="md"
                  color="fg.muted"
                  _hover={{ bg: 'bg.surface', color: 'fg' }}
                  onClick={() => onCopyMetadataValue(document.originalName, 'Original filename')}
                >
                  <ClipboardCopy size={16} />
                </chakra.button>
              ) : null}
            </Flex>
          ))}
        </Box>

        <Box
          rounded="xl"
          borderWidth="1px"
          borderColor="border.surface"
          bg="bg.subtle"
          px={{ base: '4', md: '6' }}
          py={{ base: '4', md: '5' }}
        >
          <Flex align="center" gap="3" color="fg.muted" mb="4">
            <Search size={18} />
            <Text
              fontWeight="semibold"
              textTransform="uppercase"
              letterSpacing="wide"
              fontSize="sm"
            >
              Semantic search
            </Text>
          </Flex>
          <Flex
            align={{ base: 'flex-start', md: 'center' }}
            direction={{ base: 'column', md: 'row' }}
            gap={{ base: '2', md: '4' }}
            py="3"
            borderTopWidth="1px"
            borderColor="border.surface"
          >
            <Text flex="0 0 12rem" color="fg.muted">
              Status
            </Text>
            <Flex flex="1" minW="0" direction="column" gap="1.5">
              <Badge alignSelf="flex-start" colorPalette={semanticIndexLabel.tone} variant="subtle">
                {semanticIndexLabel.label}
              </Badge>
              <Text color="fg.muted" fontSize="sm" overflowWrap="anywhere">
                {semanticIndexLabel.detail}
              </Text>
            </Flex>
          </Flex>
          {semanticIndex ? (
            <>
              {[
                [
                  'Chunks',
                  `${semanticIndex.embeddedChunkCount.toLocaleString()} / ${semanticIndex.expectedChunkCount.toLocaleString()}`,
                ],
                [
                  'Last indexed',
                  semanticIndex.indexedAt ? formatDate(semanticIndex.indexedAt) : 'Not indexed',
                ],
              ].map(([label, value], index) => (
                <Flex
                  key={label}
                  align="center"
                  gap="4"
                  py="3"
                  borderTopWidth="1px"
                  borderColor="border.surface"
                >
                  <Text flex="0 0 12rem" color="fg.muted">
                    {label}
                  </Text>
                  <Text
                    flex="1"
                    minW="0"
                    fontWeight={index === 0 ? 'medium' : undefined}
                    color="fg"
                    overflowWrap="anywhere"
                  >
                    {value}
                  </Text>
                </Flex>
              ))}
            </>
          ) : null}
        </Box>

        <Box
          rounded="xl"
          borderWidth="1px"
          borderColor="border.surface"
          bg="bg.subtle"
          px={{ base: '4', md: '6' }}
          py={{ base: '4', md: '5' }}
        >
          <Flex align="center" gap="3" color="fg.muted" mb="4">
            <Info size={18} />
            <Text
              fontWeight="semibold"
              textTransform="uppercase"
              letterSpacing="wide"
              fontSize="sm"
            >
              System information
            </Text>
          </Flex>
          {[
            ['Uploaded by', document.createdBy ?? 'Unknown'],
            ['Uploaded at', formatDate(document.createdAt)],
            ['Last updated', formatDate(document.updatedAt)],
          ].map(([label, value], index) => (
            <Flex
              key={label}
              align="center"
              gap="4"
              py="3"
              borderTopWidth={index === 0 ? '1px' : undefined}
              borderBottomWidth={index < 2 ? '1px' : undefined}
              borderColor="border.surface"
            >
              <Text flex="0 0 12rem" color="fg.muted">
                {label}
              </Text>
              <Text flex="1" minW="0" fontWeight="medium" color="fg" truncate>
                {value}
              </Text>
            </Flex>
          ))}
        </Box>

        <Flex align="center" gap="2" color="fg.muted" fontSize="sm">
          <Text minW="0" truncate>
            Document ID: {document.id}
          </Text>
          <chakra.button
            type="button"
            aria-label="Copy document ID"
            display="inline-flex"
            boxSize="8"
            flexShrink={0}
            alignItems="center"
            justifyContent="center"
            rounded="md"
            _hover={{ bg: 'bg.subtle', color: 'fg' }}
            onClick={() => onCopyMetadataValue(document.id, 'Document ID')}
          >
            <ClipboardCopy size={16} />
          </chakra.button>
        </Flex>
      </Flex>

      {!isTrashDocumentRoute && (isNameEditing || isLanguageEditing) ? (
        <SaveButton
          type="submit"
          mt="5"
          disabled={isMetadataSaving || (!hasNameChanged && !hasLanguageChanged)}
        >
          {isMetadataSaving ? 'Saving...' : 'Save'}
        </SaveButton>
      ) : null}
    </chakra.form>
  );
}
