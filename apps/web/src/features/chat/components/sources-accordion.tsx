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
        style={{ marginTop: '1rem', borderTop: '1px solid var(--chakra-colors-border-subtle)', paddingTop: '0.5rem' }}
      >
        <AccordionItem value="sources" style={{ borderBottom: '0' }}>
          <AccordionTrigger
            style={{ borderRadius: '0.375rem', padding: '0.75rem 0.25rem' }}
          >
            <Flex align="center" gap="2">
              <FileText size={16} color="var(--chakra-colors-text-muted)" />
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
                    bg="surface.subtle"
                    px="4"
                    py="3"
                    textAlign="left"
                    cursor="pointer"
                    _hover={{ bg: 'accent.subtle' }}
                  >
                    <Flex
                      boxSize="8"
                      shrink="0"
                      align="center"
                      justify="center"
                      rounded="full"
                      bg="surface.selected"
                      fontSize="sm"
                      fontWeight="semibold"
                      color="text.default"
                    >
                      {index + 1}
                    </Flex>
                    <Flex direction="column" gap="1">
                      <Flex align="center" gap="2" fontSize="sm" flexWrap="wrap">
                        <Text fontWeight="medium" color="text.default">{pageRange(citation)}</Text>
                        {currentVaultId !== citation.vaultId ? (
                          <Text color="text.muted">{citation.vaultName}</Text>
                        ) : null}
                      </Flex>
                      {citationSectionLabel(citation) ? (
                        <Text lineClamp="1" fontSize="xs" color="text.muted">
                          {citationSectionLabel(citation)}
                        </Text>
                      ) : null}
                      <Text lineClamp="2" fontSize="sm" lineHeight="6" color="text.muted">
                        {citation.snippet}
                      </Text>
                      {figurePreview ? (
                        <Text lineClamp="2" fontSize="xs" lineHeight="5" color="text.muted">
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
        key={selectedCitation?.chunkId ?? 'no-citation'}
        citation={selectedCitation}
        open={selectedCitation !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedCitation(null);
        }}
      />
    </>
  );
}
