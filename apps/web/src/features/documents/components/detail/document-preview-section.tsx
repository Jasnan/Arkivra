import { useState } from 'react';
import { Box, Flex, Text, chakra } from '@chakra-ui/react';
import { Download, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
  isHistoricalVersion = false,
  historicalDownloadUrl,
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
  isHistoricalVersion?: boolean;
  historicalDownloadUrl?: string;
  onPrint: () => void;
}) {
  const [imagePreviewFailure, setImagePreviewFailure] = useState<{
    failed: boolean;
    url: string;
  } | null>(null);
  const imagePreviewFailed =
    imagePreviewFailure?.url === inlineFileUrl && imagePreviewFailure.failed;

  if (isHistoricalVersion) {
    if ((previewKind === 'markdown' || previewKind === 'text') && canPreview) {
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
          {previewKind === 'markdown' ? (
            <DocumentMarkdownPreview markdown={fallbackMarkdownContent} />
          ) : (
            <Text
              as="pre"
              whiteSpace="pre-wrap"
              overflowWrap="anywhere"
              fontFamily="document"
              fontSize="sm"
              color="fg"
            >
              {fallbackMarkdownContent || 'No extracted text is available for this version.'}
            </Text>
          )}
        </Box>
      );
    }

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
              Historical preview is limited
            </Text>
            <Text maxW="xl" fontSize="sm" lineHeight="6" color="fg.muted">
              This read-only version can be reviewed through extracted text, chunks, metadata, or
              by downloading the original source file.
            </Text>
          </Box>
          {historicalDownloadUrl ? (
            <a href={historicalDownloadUrl}>
              <Button as="span" variant="outline" size="sm">
                <Download size={16} />
                Download version
              </Button>
            </a>
          ) : null}
        </Flex>
      </Box>
    );
  }

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
          {imagePreviewFailed ? (
            <Flex
              direction="column"
              align="center"
              justify="center"
              gap="3"
              color="fg.muted"
              textAlign="center"
            >
              <ImageIcon size={40} />
              <Box>
                <Text fontSize="sm" fontWeight="semibold" color="fg">
                  Image preview unavailable
                </Text>
                <Text maxW="lg" fontSize="sm" lineHeight="6">
                  Arkivra could not render this image in the browser. Download the file to inspect it.
                </Text>
              </Box>
            </Flex>
          ) : (
            <chakra.img
              key={inlineFileUrl}
              src={inlineFileUrl}
              alt={document.name}
              display="block"
              maxH="full"
              w="auto"
              maxW="full"
              objectFit="contain"
              onLoad={() => setImagePreviewFailure({ failed: false, url: inlineFileUrl })}
              onError={() => setImagePreviewFailure({ failed: true, url: inlineFileUrl })}
            />
          )}
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
