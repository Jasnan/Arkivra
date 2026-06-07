import { Box, Flex, Spinner, Tabs as ChakraTabs, Text } from '@chakra-ui/react';
import { DocumentChunkList } from '@/features/documents/components/detail/document-chunk-list';
import type { DocumentChunkSummary } from '@/features/documents/documents.types';

export type DocumentContentTab = 'text' | 'chunks';

export function DocumentContentSection({
  processingStatus,
  showExtractionStatus,
  extractionStageLabel,
  extractionStatusDescription,
  extractedTextMessage,
  documentContentTab,
  onDocumentContentTabChange,
  chunks,
  isChunksLoading,
  isChunksError,
}: {
  processingStatus: string | undefined;
  showExtractionStatus: boolean;
  extractionStageLabel: string;
  extractionStatusDescription: string;
  extractedTextMessage: string;
  documentContentTab: DocumentContentTab;
  onDocumentContentTabChange: (tab: DocumentContentTab) => void;
  chunks: DocumentChunkSummary[];
  isChunksLoading: boolean;
  isChunksError: boolean;
}) {
  return (
    <Flex direction="column" h="full" minH="0" gap="3">
      {showExtractionStatus ? (
        <Flex flexWrap="wrap" align="center" flexShrink={0} gap="3">
          <Box
            as="span"
            display="inline-flex"
            alignItems="center"
            rounded="full"
            px="3"
            py="1"
            fontSize="xs"
            fontWeight="semibold"
            textTransform="uppercase"
            letterSpacing="wide"
            bg={processingStatus === 'failed' ? 'bg.error' : 'bg.warning'}
            color={processingStatus === 'failed' ? 'fg.error' : 'fg.warning'}
          >
            {extractionStageLabel}
          </Box>
          <Text fontSize="sm" lineHeight="6" color="fg.muted">
            {extractionStatusDescription}
          </Text>
        </Flex>
      ) : null}
      <ChakraTabs.Root
        value={documentContentTab}
        onValueChange={(event) => {
          if (event.value === 'text' || event.value === 'chunks') {
            onDocumentContentTabChange(event.value);
          }
        }}
        display="flex"
        flexDirection="column"
        flex="1"
        minH="0"
        gap="0"
      >
        <ChakraTabs.List
          alignSelf="flex-start"
          flexShrink={0}
          rounded="lg"
          borderWidth="1px"
          borderColor="border.surface"
          bg="bg.surface"
          p="1"
        >
          <ChakraTabs.Trigger value="text" px="3" py="2" rounded="md" fontSize="sm">
            Extracted text
          </ChakraTabs.Trigger>
          <ChakraTabs.Trigger value="chunks" px="3" py="2" rounded="md" fontSize="sm">
            Chunks
          </ChakraTabs.Trigger>
        </ChakraTabs.List>

        <ChakraTabs.Content value="text" mb="5" flex="1" minH="0">
          <Box
            className="arkivra-document-content"
            h="full"
            minH="0"
            mb="3"
            overflow="auto"
            rounded="lg"
            bg="bg.subtle"
            p="5"
            fontFamily="document"
            fontSize="sm"
            color="fg"
          >
            {extractedTextMessage}
          </Box>
        </ChakraTabs.Content>

        <ChakraTabs.Content value="chunks" mb="5" flex="1" minH="0">
          <Box h="full" minH="0" mb="3" overflow="auto" rounded="lg" bg="bg.subtle">
            {isChunksLoading ? (
              <Flex h="full" minH="64" align="center" justify="center" gap="3" color="fg.muted">
                <Spinner size="sm" color="teal.solid" />
                <Text fontSize="sm">Loading chunks...</Text>
              </Flex>
            ) : isChunksError ? (
              <Flex h="full" minH="64" align="center" justify="center" px="6" textAlign="center">
                <Text fontSize="sm" fontWeight="semibold" color="fg.error">
                  Unable to load chunks.
                </Text>
              </Flex>
            ) : (
              <DocumentChunkList chunks={chunks} />
            )}
          </Box>
        </ChakraTabs.Content>
      </ChakraTabs.Root>
    </Flex>
  );
}
