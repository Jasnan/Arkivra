import { useEffect, useMemo, useState } from 'react';
import { Box, Flex, Text, chakra } from '@chakra-ui/react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  getDocumentInlineFileUrl,
  getDocumentPagePreviewUrl,
} from '@/features/documents/documents.api';
import type { Citation } from '../chat.types';

interface CitationPreviewModalProps {
  citation: Citation | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onExitComplete?: () => void;
}

const browserImagePreviewExtensions = new Set(['gif', 'jpeg', 'jpg', 'png', 'webp']);

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

function groupBoundingBoxesByPage(citation: Citation) {
  const grouped = new Map<number, Citation['boundingBoxes']>();
  for (const boundingBox of citation.boundingBoxes) {
    if (!isRenderableBoundingBox(boundingBox)) {
      continue;
    }

    const current = grouped.get(boundingBox.pageNumber) ?? [];
    current.push(boundingBox);
    grouped.set(boundingBox.pageNumber, current);
  }
  return grouped;
}

function citationPreviewPages(citation: Citation) {
  const pageNumbers = new Set<number>();
  if (citation.pageStart !== null && citation.pageEnd !== null) {
    for (let pageNumber = citation.pageStart; pageNumber <= citation.pageEnd; pageNumber += 1) {
      pageNumbers.add(pageNumber);
    }
  }
  if (citation.pageStart !== null) pageNumbers.add(citation.pageStart);
  if (citation.pageEnd !== null) pageNumbers.add(citation.pageEnd);
  for (const boundingBox of citation.boundingBoxes) {
    pageNumbers.add(boundingBox.pageNumber);
  }
  return [...pageNumbers].sort((a, b) => a - b);
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

  useEffect(() => {
    if (citation) {
      const initialPages = citationPreviewPages(citation);
      setSelectedPage(initialPages[0] ?? null);
      setImageSize(null);
      setImageError(false);
    }
  }, [citation]);

  const activePage = citation ? (selectedPage ?? pages[0] ?? null) : null;
  const pageBoxes =
    citation && activePage !== null ? (groupedBoxes.get(activePage) ?? []) : [];
  const activePreviewUrl =
    citation === null || activePage === null
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
                    {activePage !== null ? `Page ${activePage}` : 'Document preview unavailable'}
                  </DialogDescription>
                </Box>

                <Box minH="0" flex="1" overflow="auto" p="6">
                  {activePreviewUrl === null ? (
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
                    <Box mx="auto" w="100%" maxW="container.lg" rounded="2xl" borderWidth="1px" borderColor="border" bg="bg.surface" overflow="hidden" shadow="md">
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
                              const left = (boundingBox.x0 / boundingBox.layoutWidth) * imageSize.width;
                              const top = (boundingBox.y0 / boundingBox.layoutHeight) * imageSize.height;
                              const width = ((boundingBox.x1 - boundingBox.x0) / boundingBox.layoutWidth) * imageSize.width;
                              const height = ((boundingBox.y1 - boundingBox.y0) / boundingBox.layoutHeight) * imageSize.height;

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
