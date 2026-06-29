import type { ReactNode } from 'react';
import { useState } from 'react';
import { Box, Flex, Text, chakra } from '@chakra-ui/react';
import { Download, Image as ImageIcon, LoaderCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AppEmptyState } from '@/components/ui/empty-state';
import { PdfPreviewFrame } from '@/features/documents/components/detail/pdf-preview-frame';
import { DocumentStructuredTextPreview } from '@/features/documents/components/detail/document-structured-text-preview';
import type { DocumentDetail } from '@/features/documents/documents.types';

export type DocumentPreviewKind =
  | 'pdf'
  | 'image'
  | 'markdown'
  | 'structured-text'
  | 'text'
  | 'pending'
  | 'failed'
  | 'unsupported';

function PreviewEmptyState({
  icon,
  title,
  description,
  children,
}: {
  icon: ReactNode;
  title: ReactNode;
  description: ReactNode;
  children?: ReactNode;
}) {
  return (
    <Box h="full" minH={{ base: '720px', md: '0' }} rounded="lg" bg="bg.subtle" p="6">
      <Flex
        h="full"
        align="center"
        justify="center"
        rounded="lg"
        borderWidth="1px"
        borderColor="border.surface"
        bg="bg.surface"
        px="6"
      >
        <AppEmptyState icon={icon} title={title} description={description}>
          {children}
        </AppEmptyState>
      </Flex>
    </Box>
  );
}

function PreviewTextFrame({ children }: { children: ReactNode }) {
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
      {children}
    </Box>
  );
}

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
    if (
      (previewKind === 'markdown' || previewKind === 'structured-text' || previewKind === 'text') &&
      canPreview
    ) {
      return (
        <>
          {previewKind === 'markdown' || previewKind === 'structured-text' ? (
            <DocumentStructuredTextPreview
              content={fallbackMarkdownContent}
              mimeType={document.mimeType}
              name={document.name}
              originalName={document.originalName}
            />
          ) : (
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
            </Box>
          )}
        </>
      );
    }

    return (
      <PreviewEmptyState
        icon={<ImageIcon size={34} />}
        title="Historical preview is limited"
        description="This read-only version can be reviewed through extracted text, chunks, metadata, or by downloading the original source file."
      >
        {historicalDownloadUrl ? (
          <a href={historicalDownloadUrl}>
            <Button as="span" variant="outline" size="sm">
              <Download size={16} />
              Download version
            </Button>
          </a>
        ) : null}
      </PreviewEmptyState>
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
            <AppEmptyState
              icon={<ImageIcon size={34} />}
              title="Image preview unavailable"
              description="Arkivra could not render this image in the browser. Download the file to inspect it."
            />
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
            Loading text preview...
          </Text>
        ) : isMarkdownError && fallbackMarkdownContent.length === 0 ? (
          <Text fontSize="sm" color="fg.error">
            Unable to load text preview.
          </Text>
        ) : (
          <Text
            as="pre"
            whiteSpace="pre-wrap"
            overflowWrap="anywhere"
            fontFamily="document"
            fontSize="sm"
            lineHeight="1.7"
            color="fg"
          >
            {markdownSource ?? fallbackMarkdownContent}
          </Text>
        )}
      </Box>
    );
  }

  if ((previewKind === 'markdown' || previewKind === 'structured-text') && canPreview) {
    if (isMarkdownLoading && markdownSource === undefined) {
      return (
        <PreviewTextFrame>
          <Text fontSize="sm" color="fg.muted">
            Loading source preview...
          </Text>
        </PreviewTextFrame>
      );
    }

    if (isMarkdownError && fallbackMarkdownContent.length === 0) {
      return (
        <PreviewTextFrame>
          <Text fontSize="sm" color="fg.error">
            Unable to load source preview.
          </Text>
        </PreviewTextFrame>
      );
    }

    return (
      <DocumentStructuredTextPreview
        content={markdownSource ?? fallbackMarkdownContent}
        mimeType={document.mimeType}
        name={document.name}
        originalName={document.originalName}
      />
    );
  }

  if (previewKind === 'pending') {
    return (
      <PreviewEmptyState
        icon={<LoaderCircle size={34} aria-hidden="true" />}
        title="Generating preview..."
        description="Arkivra is generating a preview for this document. This usually takes only a few seconds."
      >
        <Flex direction="column" gap="2" w="full" maxW="md" aria-hidden="true">
          <Box h="3" rounded="full" bg="bg.muted" />
          <Box h="3" w="82%" alignSelf="center" rounded="full" bg="bg.muted" />
          <Box h="3" w="64%" alignSelf="center" rounded="full" bg="bg.muted" />
        </Flex>
      </PreviewEmptyState>
    );
  }

  if (previewKind === 'failed') {
    return (
      <PreviewEmptyState
        icon={<ImageIcon size={34} />}
        title="Preview couldn't be generated."
        description="The original document is still available for download and AI features continue to work."
      />
    );
  }

  if (previewKind === 'unsupported' || (document.isDeleted && !isTrashDocumentRoute)) {
    return (
      <PreviewEmptyState
        icon={<ImageIcon size={34} />}
        title="Preview unavailable"
        description={getPreviewUnavailableDescription({ document, isTrashDocumentRoute })}
      />
    );
  }

  return null;
}

function getPreviewUnavailableDescription({
  document,
  isTrashDocumentRoute,
}: {
  document: DocumentDetail;
  isTrashDocumentRoute: boolean;
}) {
  if (document.isDeleted && !isTrashDocumentRoute) {
    return 'Preview is disabled for documents in trash. Restore the document to preview or print it again.';
  }

  if (document.derivedPreviewErrorCode === 'document.preview_conversion_unavailable') {
    return 'Office document conversion is currently unavailable. The original document has been stored safely and can still be downloaded.';
  }

  if (document.derivedPreviewErrorCode === 'document.preview_conversion_disabled') {
    return 'Office document conversion has been disabled by your administrator.';
  }

  if (document.derivedPreviewErrorCode === 'document.preview_conversion_not_configured') {
    return 'Office document conversion has not been configured. The original document has been stored safely and can still be downloaded.';
  }

  return 'This file type is supported for storage and extraction, but Arkivra does not render a faithful in-browser preview for it yet.';
}
