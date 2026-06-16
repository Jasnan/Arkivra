import { useState } from 'react';
import { Box, Flex, Text, chakra } from '@chakra-ui/react';
import { FileText } from 'lucide-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import type { Citation } from '../chat.types';
import { citationSectionLabel, citationFigureEvidence, pageRange } from './chat-utils';
import { CitationPreviewModal } from './citation-preview-modal';

export function SourcesAccordion({
  currentVaultId,
  citations,
}: {
  currentVaultId?: string;
  citations: Citation[];
}) {
  const [selectedCitation, setSelectedCitation] = useState<Citation | null>(null);
  const [isCitationPreviewOpen, setIsCitationPreviewOpen] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  if (citations.length === 0) return null;

  return (
    <>
      <Accordion
        type="single"
        collapsible
        value={isOpen ? 'sources' : undefined}
        onValueChange={(value) => setIsOpen(value === 'sources')}
        minW="0"
        maxW="full"
        overflowX="hidden"
      >
        <AccordionItem value="sources" style={{ borderBottom: '0' }}>
          <AccordionTrigger
            style={{ borderRadius: '0.5rem', padding: '0.35rem 0' }}
          >
            <Flex align="center" gap="2" minW="0" fontSize="xs" color="fg.muted">
              <FileText size={14} color="currentColor" />
              <Text fontWeight="medium">{`Cited passages (${citations.length})`}</Text>
            </Flex>
          </AccordionTrigger>
          <AccordionContent>
            <Box h="1" />
            <Flex direction="column" gap="2" minW="0" maxW="full">
              {citations.map((citation, index) => {
                const figurePreview = citationFigureEvidence(citation)[0] ?? null;
                return (
                  <chakra.button
                    key={citation.chunkId}
                    type="button"
                    onClick={() => {
                      setSelectedCitation(citation);
                      setIsCitationPreviewOpen(true);
                    }}
                    display="flex"
                    w="100%"
                    minW="0"
                    maxW="full"
                    overflow="hidden"
                    alignItems="flex-start"
                    gap="2.5"
                    rounded="lg"
                    bg="bg.surface"
                    borderWidth="1px"
                    borderColor="border.surface"
                    px="3"
                    py="2.5"
                    textAlign="left"
                    cursor="pointer"
                    _hover={{ bg: 'teal.subtle', borderColor: 'teal.muted' }}
                  >
                    <Flex
                      boxSize="6"
                      shrink="0"
                      align="center"
                      justify="center"
                      rounded="full"
                      bg="teal.subtle"
                      fontSize="xs"
                      fontWeight="semibold"
                      color="fg"
                    >
                      {index + 1}
                    </Flex>
                    <Flex direction="column" gap="1" minW="0" maxW="full">
                      <Flex align="center" gap="2" minW="0" fontSize="sm" flexWrap="wrap">
                        <Text fontWeight="medium" color="fg">{pageRange(citation)}</Text>
                        {currentVaultId !== citation.vaultId ? (
                          <Text minW="0" color="fg.muted" overflowWrap="anywhere">{citation.vaultName}</Text>
                        ) : null}
                      </Flex>
                      {citationSectionLabel(citation) ? (
                        <Text minW="0" lineClamp="1" fontSize="xs" color="fg.muted" overflowWrap="anywhere">
                          {citationSectionLabel(citation)}
                        </Text>
                      ) : null}
                      <Text minW="0" lineClamp="2" fontSize="xs" lineHeight="1.5" color="fg.muted" overflowWrap="anywhere">
                        {citation.snippet}
                      </Text>
                      {figurePreview ? (
                        <Text minW="0" lineClamp="2" fontSize="xs" lineHeight="1.5" color="fg.muted" overflowWrap="anywhere">
                          {figurePreview.caption}
                        </Text>
                      ) : null}
                    </Flex>
                  </chakra.button>
                );
              })}
            </Flex>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <CitationPreviewModal
        citation={selectedCitation}
        open={isCitationPreviewOpen}
        onOpenChange={setIsCitationPreviewOpen}
        onExitComplete={() => setSelectedCitation(null)}
      />
    </>
  );
}
