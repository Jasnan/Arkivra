import { useState } from 'react';
import { Flex, Text, chakra } from '@chakra-ui/react';
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
  const [isOpen, setIsOpen] = useState(false);

  if (citations.length === 0) return null;

  return (
    <>
      <Accordion
        type="single"
        collapsible
        value={isOpen ? 'sources' : undefined}
        onValueChange={(value) => setIsOpen(value === 'sources')}
        mt="4"
        mb={isOpen ? { base: '10rem', md: '9rem' } : '0'}
        borderTopWidth="1px"
        borderTopColor="border"
        pt="2"
      >
        <AccordionItem value="sources" style={{ borderBottom: '0' }}>
          <AccordionTrigger
            style={{ borderRadius: '0.375rem', padding: '0.75rem 0.25rem' }}
          >
            <Flex align="center" gap="2">
              <FileText size={16} color="var(--chakra-colors-fg-muted)" />
              <Text>{`Sources (${citations.length})`}</Text>
            </Flex>
          </AccordionTrigger>
          <AccordionContent>
            <Flex direction="column" gap="3">
              {citations.map((citation, index) => {
                const figurePreview = citationFigureEvidence(citation)[0] ?? null;
                return (
                  <chakra.button
                    key={citation.chunkId}
                    type="button"
                    onClick={() => setSelectedCitation(citation)}
                    display="flex"
                    w="100%"
                    alignItems="flex-start"
                    gap="3"
                    rounded="2xl"
                    bg="bg.surface"
                    px="4"
                    py="3"
                    textAlign="left"
                    cursor="pointer"
                    _hover={{ bg: 'teal.subtle' }}
                  >
                    <Flex
                      boxSize="8"
                      shrink="0"
                      align="center"
                      justify="center"
                      rounded="full"
                      bg="teal.subtle"
                      fontSize="sm"
                      fontWeight="semibold"
                      color="fg"
                    >
                      {index + 1}
                    </Flex>
                    <Flex direction="column" gap="1">
                      <Flex align="center" gap="2" fontSize="sm" flexWrap="wrap">
                        <Text fontWeight="medium" color="fg">{pageRange(citation)}</Text>
                        {currentVaultId !== citation.vaultId ? (
                          <Text color="fg.muted">{citation.vaultName}</Text>
                        ) : null}
                      </Flex>
                      {citationSectionLabel(citation) ? (
                        <Text lineClamp="1" fontSize="xs" color="fg.muted">
                          {citationSectionLabel(citation)}
                        </Text>
                      ) : null}
                      <Text lineClamp="2" fontSize="sm" lineHeight="1.6" color="fg.muted">
                        {citation.snippet}
                      </Text>
                      {figurePreview ? (
                        <Text lineClamp="2" fontSize="xs" lineHeight="1.5" color="fg.muted">
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
        open={selectedCitation !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedCitation(null);
        }}
      />
    </>
  );
}
