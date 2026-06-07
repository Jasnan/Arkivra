import { Box, Flex, Text, chakra } from '@chakra-ui/react';
import { Image as ImageIcon } from 'lucide-react';
import { DocumentMarkdownPreview } from '@/features/documents/components/document-markdown-preview';
import { PdfPreviewFrame } from '@/features/documents/components/detail/pdf-preview-frame';
import type { DocumentDetail } from '@/features/documents/documents.types';

export type DocumentPreviewKind = 'pdf' | 'image' | 'markdown' | 'text' | 'unsupported';

export function DocumentPreviewSection({
  previewKind,
  canPreview,
  inlineFileUrl,
  document,
  vaultId,
  documentId,
  isTrashDocumentRoute,
  aiFeaturesEnabled,
  markdownSource,
  isMarkdownLoading,
  isMarkdownError,
  fallbackMarkdownContent,
  onPrint,
}: {
  previewKind: DocumentPreviewKind;
  canPreview: boolean;
  inlineFileUrl: string;
  document: DocumentDetail;
  vaultId: string;
  documentId: string;
  isTrashDocumentRoute: boolean;
  aiFeaturesEnabled: boolean;
  markdownSource: string | undefined;
  isMarkdownLoading: boolean;
  isMarkdownError: boolean;
  fallbackMarkdownContent: string;
  onPrint: () => void;
}) {
  if (previewKind === 'pdf' && canPreview) {
    return (
      <PdfPreviewFrame
        key={inlineFileUrl}
        src={inlineFileUrl}
        vaultId={vaultId}
        documentId={documentId}
        onPrint={onPrint}
        translationsDisabled={isTrashDocumentRoute || !aiFeaturesEnabled}
        sourceLanguage={document.language}
      />
    );
  }

  if (previewKind === 'image' && canPreview) {
    return (
      <Box
        h="full"
        minH={{ base: '720px', md: '0' }}
        overflow="hidden"
        rounded="lg"
        bg="bg.subtle"
        p="4"
      >
        <Flex h="full" align="center" justify="center" rounded="lg" bg="white" p="8">
          <chakra.img
            src={inlineFileUrl}
            alt={document.name}
            maxH="full"
            w="auto"
            maxW="full"
            objectFit="contain"
          />
        </Flex>
      </Box>
    );
  }

  if (previewKind === 'text' && canPreview) {
    return (
      <Box
        h="full"
        minH={{ base: '720px', md: '0' }}
        overflow="hidden"
        rounded="lg"
        bg="bg.subtle"
        p="2"
      >
        <chakra.iframe
          title="Text preview"
          src={inlineFileUrl}
          h="full"
          w="full"
          rounded="lg"
          bg="white"
        />
      </Box>
    );
  }

  if (previewKind === 'markdown' && canPreview) {
    return (
      <Box
        h="full"
        minH={{ base: '720px', md: '0' }}
        overflow="auto"
        rounded="lg"
        borderWidth="1px"
        borderColor="border.surface"
        bg="bg.surface"
        px={{ base: '4', md: '8' }}
        py={{ base: '5', md: '7' }}
      >
        {isMarkdownLoading && markdownSource === undefined ? (
          <Text fontSize="sm" color="fg.muted">
            Loading Markdown preview...
          </Text>
        ) : isMarkdownError && fallbackMarkdownContent.length === 0 ? (
          <Text fontSize="sm" color="fg.error">
            Unable to load Markdown preview.
          </Text>
        ) : (
          <DocumentMarkdownPreview markdown={markdownSource ?? fallbackMarkdownContent} />
        )}
      </Box>
    );
  }

  if (previewKind === 'unsupported' || (document.isDeleted && !isTrashDocumentRoute)) {
    return (
      <Box h="full" minH={{ base: '720px', md: '0' }} rounded="lg" bg="bg.subtle" p="6">
        <Flex
          h="full"
          direction="column"
          align="center"
          justify="center"
          gap="4"
          rounded="lg"
          borderWidth="1px"
          borderStyle="dashed"
          borderColor="border.surface"
          bg="bg.surface"
          px="6"
          textAlign="center"
        >
          <ImageIcon size={40} />
          <Box>
            <Text fontSize="sm" fontWeight="semibold" color="fg">
              Preview unavailable
            </Text>
            <Text maxW="xl" fontSize="sm" lineHeight="6" color="fg.muted">
              {document.isDeleted
                ? 'Preview is disabled for documents in trash. Restore the document to preview or print it again.'
                : 'This file type is supported for storage and extraction, but Arkivra does not render a faithful in-browser preview for it yet.'}
            </Text>
          </Box>
        </Flex>
      </Box>
    );
  }

  return null;
}
