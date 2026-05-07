import { useMemo, useState } from 'react';
import { Box, Flex, Text, chakra } from '@chakra-ui/react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { getDocumentPagePreviewUrl } from '@/features/documents/documents.api';
import type { Citation } from '../chat.types';
import {
  citationSectionLabel,
  citationFigureEvidence,
  citationImageAssets,
  pageRange,
  uniqueNonEmptyStrings,
} from './chat-utils';

interface CitationPreviewModalProps {
  citation: Citation | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function groupBoundingBoxesByPage(citation: Citation) {
  const grouped = new Map<number, Citation['boundingBoxes']>();
  for (const boundingBox of citation.boundingBoxes) {
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

export function CitationPreviewModal({ citation, open, onOpenChange }: CitationPreviewModalProps) {
  const pages = useMemo(() => (citation ? citationPreviewPages(citation) : []), [citation]);
  const groupedBoxes = useMemo(
    () =>
      citation ? groupBoundingBoxesByPage(citation) : new Map<number, Citation['boundingBoxes']>(),
    [citation],
  );
  const [selectedPage, setSelectedPage] = useState<number | null>(pages[0] ?? null);
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
  const [imageError, setImageError] = useState(false);

  if (!citation) return null;

  const activePage = selectedPage ?? pages[0] ?? null;
  const pageBoxes = activePage === null ? [] : (groupedBoxes.get(activePage) ?? []);
  const sectionLabel = citationSectionLabel(citation);
  const figureEvidence = citationFigureEvidence(citation);
  const imageSourceElementIds = uniqueNonEmptyStrings(
    citationImageAssets(citation).map((asset) => asset.sourceElementId),
  );
  const tableSourceElementIds = uniqueNonEmptyStrings(citation.tableSourceElementIds ?? []);
  const chunkSourceElementIds = uniqueNonEmptyStrings(citation.sourceElementIds ?? []);
  const activePreviewUrl =
    activePage === null
      ? null
      : getDocumentPagePreviewUrl({
          vaultId: citation.vaultId,
          documentId: citation.documentId,
          pageNumber: activePage,
        });
  const canRenderOverlay = pageBoxes.length > 0 && imageSize !== null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        style={{ height: '90vh', maxHeight: '90vh', maxWidth: '72rem', overflow: 'hidden' }}
        p="0"
      >
        <Flex h="100%" minH="0" direction={{ base: 'column', lg: 'row' }}>
          <Box flex="1" minH="0">
            <Box bg="bg.subtle" minH="0" h="100%" display="flex" flexDirection="column">
              <Box borderBottomWidth="1px" borderColor="border.subtle" px="6" py="5">
                <DialogTitle>{citation.documentName}</DialogTitle>
                <DialogDescription>
                  {activePage !== null ? `Page ${activePage}` : 'Document preview unavailable'}
                </DialogDescription>
              </Box>

              <Flex
                align="center"
                justify="space-between"
                borderBottomWidth="1px"
                borderColor="border.subtle"
                px="6"
                py="3"
              >
                <Flex gap="2" flexWrap="wrap">
                  {pages.map((pageNumber) => (
                    <Button
                      key={pageNumber}
                      type="button"
                      variant={activePage === pageNumber ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => {
                        setSelectedPage(pageNumber);
                        setImageSize(null);
                        setImageError(false);
                      }}
                    >
                      {`Page ${pageNumber}`}
                    </Button>
                  ))}
                </Flex>
                {pages.length > 1 ? (
                  <Flex align="center" gap="2">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      disabled={activePage === null || activePage === pages[0]}
                      onClick={() => {
                        if (activePage === null) return;
                        const currentIndex = pages.indexOf(activePage);
                        const previousPage = currentIndex > 0 ? pages[currentIndex - 1] : null;
                        if (previousPage !== null) {
                          setSelectedPage(previousPage);
                          setImageSize(null);
                          setImageError(false);
                        }
                      }}
                    >
                      <ChevronLeft size={16} />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      disabled={activePage === null || activePage === pages.at(-1)}
                      onClick={() => {
                        if (activePage === null) return;
                        const currentIndex = pages.indexOf(activePage);
                        const nextPage = currentIndex >= 0 ? (pages[currentIndex + 1] ?? null) : null;
                        if (nextPage !== null) {
                          setSelectedPage(nextPage);
                          setImageSize(null);
                          setImageError(false);
                        }
                      }}
                    >
                      <ChevronRight size={16} />
                    </Button>
                  </Flex>
                ) : null}
              </Flex>

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
                    borderColor="border.subtle"
                    bg="bg.subtle"
                    p="8"
                    textAlign="center"
                    fontSize="sm"
                    color="fg.muted"
                  >
                    No page preview is available for this citation.
                  </Flex>
                ) : (
                  <Box mx="auto" w="100%" maxW="container.lg" rounded="2xl" borderWidth="1px" borderColor="border.subtle" bg="bg.panel" p="4" shadow="sm">
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

          <Box
            minH="0"
            overflow="auto"
            borderTopWidth="1px"
            borderColor="border.subtle"
            bg="bg.panel"
            lg={{
              borderLeftWidth: '1px',
              borderTopWidth: '0',
              width: '22rem',
              flexShrink: 0,
            }}
          >
            <Flex direction="column" gap="5" p="6">
              <Flex direction="column" gap="2">
                <Text fontSize="xs" fontWeight="semibold" textTransform="uppercase" letterSpacing="0.16em" color="fg.muted">
                  Source details
                </Text>
                <Box>
                  <Text fontSize="base" fontWeight="semibold" color="fg">{citation.documentName}</Text>
                  <Text mt="1" fontSize="sm" color="fg.muted">{pageRange(citation)}</Text>
                </Box>
              </Flex>

              <Flex direction="column" gap="2">
                <Text fontSize="xs" fontWeight="semibold" textTransform="uppercase" letterSpacing="0.16em" color="fg.muted">
                  Citation precision
                </Text>
                <Text fontSize="sm" color="fg">
                  {citation.citationPrecision === 'box'
                    ? 'Exact box overlay available'
                    : citation.citationPrecision === 'page'
                      ? 'Page-level citation available'
                      : 'Document-level citation only'}
                </Text>
              </Flex>

              {sectionLabel ? (
                <Flex direction="column" gap="2">
                  <Text fontSize="xs" fontWeight="semibold" textTransform="uppercase" letterSpacing="0.16em" color="fg.muted">
                    Section
                  </Text>
                  <Text fontSize="sm" color="fg">{sectionLabel}</Text>
                </Flex>
              ) : null}

              <Flex direction="column" gap="2">
                <Text fontSize="xs" fontWeight="semibold" textTransform="uppercase" letterSpacing="0.16em" color="fg.muted">
                  Matched text
                </Text>
                <Box rounded="2xl" borderWidth="1px" borderColor="border.subtle" bg="bg.subtle" p="4" fontSize="sm" lineHeight="6" color="fg">
                  {citation.snippet}
                </Box>
              </Flex>

              {figureEvidence.length > 0 ? (
                <Flex direction="column" gap="3">
                  <Text fontSize="xs" fontWeight="semibold" textTransform="uppercase" letterSpacing="0.16em" color="fg.muted">
                    Figure evidence
                  </Text>
                  <Flex direction="column" gap="3">
                    {figureEvidence.map((figure) => (
                      <Box key={figure.id} rounded="2xl" borderWidth="1px" borderColor="border.subtle" bg="bg.subtle" p="4">
                        <Flex align="center" gap="2" fontSize="sm" flexWrap="wrap">
                          <Text fontWeight="medium" color="fg">{figure.label}</Text>
                          {figure.pageLabel ? (
                            <Text color="fg.muted">{figure.pageLabel}</Text>
                          ) : null}
                        </Flex>
                        <Text mt="2" fontSize="sm" lineHeight="6" color="fg">{figure.caption}</Text>
                      </Box>
                    ))}
                  </Flex>
                </Flex>
              ) : null}

              {chunkSourceElementIds.length > 0 ||
              tableSourceElementIds.length > 0 ||
              imageSourceElementIds.length > 0 ? (
                <Flex direction="column" gap="3">
                  <Text fontSize="xs" fontWeight="semibold" textTransform="uppercase" letterSpacing="0.16em" color="fg.muted">
                    Docling provenance
                  </Text>
                  {chunkSourceElementIds.length > 0 ? (
                    <Flex direction="column" gap="2">
                      <Text fontSize="sm" color="fg">Chunk elements</Text>
                      <Flex gap="2" flexWrap="wrap">
                        {chunkSourceElementIds.map((elementId) => (
                          <Box
                            key={elementId}
                            as="code"
                            rounded="md"
                            bg="bg.subtle"
                            px="2"
                            py="1"
                            fontFamily="mono"
                            fontSize="xs"
                            color="fg"
                          >
                            {elementId}
                          </Box>
                        ))}
                      </Flex>
                    </Flex>
                  ) : null}
                  {tableSourceElementIds.length > 0 ? (
                    <Flex direction="column" gap="2">
                      <Text fontSize="sm" color="fg">Table elements</Text>
                      <Flex gap="2" flexWrap="wrap">
                        {tableSourceElementIds.map((elementId) => (
                          <Box
                            key={elementId}
                            as="code"
                            rounded="md"
                            bg="bg.subtle"
                            px="2"
                            py="1"
                            fontFamily="mono"
                            fontSize="xs"
                            color="fg"
                          >
                            {elementId}
                          </Box>
                        ))}
                      </Flex>
                    </Flex>
                  ) : null}
                  {imageSourceElementIds.length > 0 ? (
                    <Flex direction="column" gap="2">
                      <Text fontSize="sm" color="fg">Image elements</Text>
                      <Flex gap="2" flexWrap="wrap">
                        {imageSourceElementIds.map((elementId) => (
                          <Box
                            key={elementId}
                            as="code"
                            rounded="md"
                            bg="bg.subtle"
                            px="2"
                            py="1"
                            fontFamily="mono"
                            fontSize="xs"
                            color="fg"
                          >
                            {elementId}
                          </Box>
                        ))}
                      </Flex>
                    </Flex>
                  ) : null}
                </Flex>
              ) : null}
            </Flex>
          </Box>
        </Flex>
      </DialogContent>
    </Dialog>
  );
}
