import { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Flex, Text, chakra } from '@chakra-ui/react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { DocumentMarkdownPreview } from '@/features/documents/components/document-markdown-preview';
import {
  getDocumentInlineFileUrl,
  getDocumentPagePreviewUrl,
} from '@/features/documents/documents.api';
import { useDocumentFileTextQuery, useDocumentQuery } from '@/features/documents/documents.queries';
import type { Citation } from '../chat.types';

interface CitationPreviewModalProps {
  citation: Citation | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onExitComplete?: () => void;
}

const browserImagePreviewExtensions = new Set(['gif', 'jpeg', 'jpg', 'png', 'webp']);
const markdownPreviewExtensions = new Set(['md', 'markdown']);
const textPreviewExtensions = new Set(['txt']);

function isRenderableBoundingBox(boundingBox: Citation['boundingBoxes'][number]) {
  return (
    Number.isFinite(boundingBox.pageNumber) &&
    Number.isFinite(boundingBox.x0) &&
    Number.isFinite(boundingBox.y0) &&
    Number.isFinite(boundingBox.x1) &&
    Number.isFinite(boundingBox.y1) &&
    Number.isFinite(boundingBox.layoutWidth) &&
    Number.isFinite(boundingBox.layoutHeight) &&
    boundingBox.layoutWidth > 0 &&
    boundingBox.layoutHeight > 0 &&
    boundingBox.x1 > boundingBox.x0 &&
    boundingBox.y1 > boundingBox.y0
  );
}

function getDocumentFileExtension(name: string) {
  const extension = name.split('.').pop()?.trim().toLowerCase();
  return extension && extension !== name.trim().toLowerCase() ? extension : '';
}

function citationUsesOriginalImagePreview(citation: Citation) {
  if (citation.mimeType?.toLowerCase().startsWith('image/')) {
    return true;
  }

  return browserImagePreviewExtensions.has(getDocumentFileExtension(citation.documentName));
}

function getCitationTextPreviewKind(citation: Citation): 'markdown' | 'text' | null {
  const mimeType = citation.mimeType?.toLowerCase() ?? '';
  const extension = getDocumentFileExtension(citation.documentName);

  if (mimeType === 'text/markdown' || markdownPreviewExtensions.has(extension)) {
    return 'markdown';
  }

  if (mimeType === 'text/plain' || textPreviewExtensions.has(extension)) {
    return 'text';
  }

  return null;
}

function getBoundingBoxGroupKey(boundingBox: Citation['boundingBoxes'][number]) {
  return [
    boundingBox.pageNumber,
    boundingBox.layoutWidth,
    boundingBox.layoutHeight,
    boundingBox.system,
  ].join(':');
}

function mergeBoundingBoxes(boundingBoxes: Citation['boundingBoxes']) {
  const groups = new Map<string, Citation['boundingBoxes'][number]>();

  for (const boundingBox of boundingBoxes) {
    if (!isRenderableBoundingBox(boundingBox)) {
      continue;
    }

    const key = getBoundingBoxGroupKey(boundingBox);
    const existing = groups.get(key);

    if (!existing) {
      groups.set(key, { ...boundingBox });
      continue;
    }

    groups.set(key, {
      ...existing,
      x0: Math.min(existing.x0, boundingBox.x0),
      y0: Math.min(existing.y0, boundingBox.y0),
      x1: Math.max(existing.x1, boundingBox.x1),
      y1: Math.max(existing.y1, boundingBox.y1),
    });
  }

  return [...groups.values()].sort(
    (left, right) => left.pageNumber - right.pageNumber || left.y0 - right.y0 || left.x0 - right.x0,
  );
}

function groupBoundingBoxesByPage(citation: Citation) {
  const grouped = new Map<number, Citation['boundingBoxes']>();
  if (citation.citationPrecision !== 'box') {
    return grouped;
  }

  for (const boundingBox of mergeBoundingBoxes(citation.boundingBoxes)) {
    const current = grouped.get(boundingBox.pageNumber) ?? [];
    current.push(boundingBox);
    grouped.set(boundingBox.pageNumber, current);
  }
  return grouped;
}

function citationPreviewPages(
  citation: Citation,
  groupedBoxes = groupBoundingBoxesByPage(citation),
) {
  const pageNumbers = new Set<number>();
  if (citation.pageStart !== null && citation.pageEnd !== null) {
    for (let pageNumber = citation.pageStart; pageNumber <= citation.pageEnd; pageNumber += 1) {
      pageNumbers.add(pageNumber);
    }
  }
  if (citation.pageStart !== null) pageNumbers.add(citation.pageStart);
  if (citation.pageEnd !== null) pageNumbers.add(citation.pageEnd);
  for (const pageNumber of groupedBoxes.keys()) {
    pageNumbers.add(pageNumber);
  }
  return [...pageNumbers].sort((a, b) => a - b);
}

function initialCitationPreviewPage(citation: Citation) {
  const groupedBoxes = groupBoundingBoxesByPage(citation);
  const firstBoxPage = [...groupedBoxes.keys()].sort((a, b) => a - b)[0];
  return firstBoxPage ?? citationPreviewPages(citation, groupedBoxes)[0] ?? null;
}

function getValidatedTextLocator(
  citation: Citation,
  sourceText: string,
  previewKind: 'markdown' | 'text',
) {
  const locator = citation.textLocator;
  const expectedSourceType = previewKind === 'markdown' ? 'rawMarkdown' : 'rawText';
  if (
    locator === undefined ||
    locator.sourceType !== expectedSourceType ||
    !Number.isInteger(locator.startOffset) ||
    !Number.isInteger(locator.endOffset) ||
    locator.startOffset < 0 ||
    locator.endOffset <= locator.startOffset ||
    locator.endOffset > sourceText.length
  ) {
    return null;
  }

  return locator;
}

function renderSourceTextWithLocator(
  sourceText: string,
  locator: NonNullable<Citation['textLocator']> | null,
) {
  if (locator === null) {
    return sourceText;
  }

  return (
    <>
      {sourceText.slice(0, locator.startOffset)}
      <mark data-testid="citation-text-highlight">
        {sourceText.slice(locator.startOffset, locator.endOffset)}
      </mark>
      {sourceText.slice(locator.endOffset)}
    </>
  );
}

function CitationTextPreview({
  citation,
  previewKind,
}: {
  citation: Citation;
  previewKind: 'markdown' | 'text';
}) {
  const documentQuery = useDocumentQuery({
    vaultId: citation.vaultId,
    documentId: citation.documentId,
  });
  const previewRef = useRef<HTMLElement>(null);
  const fileTextQuery = useDocumentFileTextQuery({
    vaultId: citation.vaultId,
    documentId: citation.documentId,
  });
  const documentContent = documentQuery.data?.document.content ?? '';
  const sourceText = fileTextQuery.data ?? documentContent;
  const canUseRawSourceLocator = fileTextQuery.data !== undefined;
  const hasSourceText = sourceText.trim().length > 0;
  const isLoading = (fileTextQuery.isLoading || documentQuery.isLoading) && !hasSourceText;
  const hasError = fileTextQuery.isError && documentQuery.isError;
  const textLocator = canUseRawSourceLocator
    ? getValidatedTextLocator(citation, sourceText, previewKind)
    : null;

  useEffect(() => {
    previewRef.current
      ?.querySelector('[data-testid="citation-text-highlight"]')
      ?.scrollIntoView({ block: 'center' });
  }, [sourceText, textLocator]);

  if (isLoading) {
    return (
      <Flex
        h="100%"
        minH="80"
        align="center"
        justify="center"
        rounded="lg"
        borderWidth="1px"
        borderColor="border.surface"
        bg="bg.surface"
        p="8"
        fontSize="sm"
        color="fg.muted"
      >
        Loading citation preview...
      </Flex>
    );
  }

  if (hasError || !hasSourceText) {
    return (
      <Flex
        h="100%"
        minH="80"
        align="center"
        justify="center"
        rounded="lg"
        borderWidth="1px"
        borderStyle="dashed"
        borderColor="border.surface"
        bg="bg.surface"
        p="8"
        textAlign="center"
        fontSize="sm"
        color="fg.muted"
      >
        No text preview is available for this citation.
      </Flex>
    );
  }

  return (
    <Box
      ref={previewRef}
      mx="auto"
      w="100%"
      maxW="container.lg"
      rounded="lg"
      borderWidth="1px"
      borderColor="border"
      bg="bg.surface"
      p={{ base: '4', md: '6' }}
      shadow="md"
    >
      {previewKind === 'markdown' && textLocator === null ? (
        <DocumentMarkdownPreview markdown={sourceText} />
      ) : (
        <Text
          as="pre"
          whiteSpace="pre-wrap"
          overflowWrap="anywhere"
          fontFamily="document"
          fontSize="sm"
          lineHeight="1.7"
          color="fg"
          css={{
            '& mark': {
              borderRadius: '0.25rem',
              background: 'color-mix(in srgb, var(--chakra-colors-teal-solid) 22%, transparent)',
              boxShadow:
                '0 0 0 1px color-mix(in srgb, var(--chakra-colors-teal-solid) 45%, transparent)',
              color: 'inherit',
              paddingInline: '0.12em',
            },
          }}
        >
          {renderSourceTextWithLocator(sourceText, textLocator)}
        </Text>
      )}
    </Box>
  );
}

export function CitationPreviewModal({
  citation,
  open,
  onOpenChange,
  onExitComplete,
}: CitationPreviewModalProps) {
  const pages = useMemo(() => (citation ? citationPreviewPages(citation) : []), [citation]);
  const groupedBoxes = useMemo(
    () =>
      citation ? groupBoundingBoxesByPage(citation) : new Map<number, Citation['boundingBoxes']>(),
    [citation],
  );
  const [selectedPage, setSelectedPage] = useState<number | null>(null);
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
  const [imageError, setImageError] = useState(false);
  const textPreviewKind = citation ? getCitationTextPreviewKind(citation) : null;

  useEffect(() => {
    if (citation) {
      setSelectedPage(initialCitationPreviewPage(citation));
      setImageSize(null);
      setImageError(false);
    }
  }, [citation]);

  const activePage = citation ? (selectedPage ?? pages[0] ?? null) : null;
  const pageBoxes = citation && activePage !== null ? (groupedBoxes.get(activePage) ?? []) : [];
  const activePreviewUrl =
    citation === null || activePage === null || textPreviewKind !== null
      ? null
      : citationUsesOriginalImagePreview(citation)
        ? getDocumentInlineFileUrl({
            vaultId: citation.vaultId,
            documentId: citation.documentId,
          })
        : getDocumentPagePreviewUrl({
            vaultId: citation.vaultId,
            documentId: citation.documentId,
            pageNumber: activePage,
          });
  const canRenderOverlay = pageBoxes.length > 0 && imageSize !== null;

  return (
    <Dialog open={open} onExitComplete={onExitComplete} onOpenChange={onOpenChange}>
      {citation ? (
        <DialogContent
          style={{ height: '90vh', maxHeight: '90vh', maxWidth: '72rem', overflow: 'hidden' }}
          p="0"
        >
          <Flex h="100%" minH="0" direction="column">
            <Box flex="1" minH="0">
              <Box bg="bg.subtle" minH="0" h="100%" display="flex" flexDirection="column">
                <Box borderBottomWidth="1px" borderColor="border.surface" px="6" py="5">
                  <DialogTitle>{citation.documentName}</DialogTitle>
                  <DialogDescription>
                    {textPreviewKind !== null
                      ? 'Text citation'
                      : activePage !== null
                        ? `Page ${activePage}`
                        : 'Document preview unavailable'}
                  </DialogDescription>
                </Box>

                <Box minH="0" flex="1" overflow="auto" p="6">
                  {textPreviewKind !== null ? (
                    <CitationTextPreview citation={citation} previewKind={textPreviewKind} />
                  ) : activePreviewUrl === null ? (
                    <Flex
                      h="100%"
                      minH="80"
                      align="center"
                      justify="center"
                      rounded="2xl"
                      borderWidth="1px"
                      borderStyle="dashed"
                      borderColor="border.surface"
                      bg="bg.subtle"
                      p="8"
                      textAlign="center"
                      fontSize="sm"
                      color="fg.muted"
                    >
                      No page preview is available for this citation.
                    </Flex>
                  ) : (
                    <Box
                      mx="auto"
                      w="100%"
                      maxW="container.lg"
                      rounded="2xl"
                      borderWidth="1px"
                      borderColor="border"
                      bg="bg.surface"
                      overflow="hidden"
                      shadow="md"
                    >
                      <Box position="relative">
                        <chakra.img
                          src={activePreviewUrl}
                          alt={`${citation.documentName} page ${activePage}`}
                          h="auto"
                          w="100%"
                          rounded="xl"
                          onLoad={(event: React.SyntheticEvent<HTMLImageElement>) => {
                            setImageSize({
                              width: event.currentTarget.clientWidth,
                              height: event.currentTarget.clientHeight,
                            });
                            setImageError(false);
                          }}
                          onError={() => {
                            setImageSize(null);
                            setImageError(true);
                          }}
                        />

                        {canRenderOverlay ? (
                          <Box position="absolute" inset="0" pointerEvents="none">
                            {pageBoxes.map((boundingBox) => {
                              const left =
                                (boundingBox.x0 / boundingBox.layoutWidth) * imageSize.width;
                              const top =
                                (boundingBox.y0 / boundingBox.layoutHeight) * imageSize.height;
                              const width =
                                ((boundingBox.x1 - boundingBox.x0) / boundingBox.layoutWidth) *
                                imageSize.width;
                              const height =
                                ((boundingBox.y1 - boundingBox.y0) / boundingBox.layoutHeight) *
                                imageSize.height;

                              return (
                                <Box
                                  key={`${boundingBox.pageNumber}-${boundingBox.x0}-${boundingBox.y0}-${boundingBox.x1}-${boundingBox.y1}`}
                                  data-testid="citation-bounding-box"
                                  position="absolute"
                                  rounded="md"
                                  borderWidth="2px"
                                  borderColor="teal.solid"
                                  bg="teal.solid/15"
                                  boxShadow="0 0 0 1px rgba(255,255,255,0.25)"
                                  style={{ left, top, width, height }}
                                />
                              );
                            })}
                          </Box>
                        ) : null}
                      </Box>
                    </Box>
                  )}

                  {imageError ? (
                    <Text mt="4" fontSize="sm" color="fg.muted">
                      Arkivra could not render a preview image for this page.
                    </Text>
                  ) : null}
                </Box>
              </Box>
            </Box>
          </Flex>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
