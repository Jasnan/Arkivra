import { Box, Flex, Text } from '@chakra-ui/react';
import type { DocumentChunkSummary } from '@/features/documents/documents.types';

function formatChunkPageLabel(chunk: DocumentChunkSummary) {
  const start = chunk.pageStart ?? chunk.pageNumber;
  const end = chunk.pageEnd ?? chunk.pageNumber;

  if (start === null || start === undefined) {
    return 'Document';
  }

  if (end === null || end === undefined || end === start) {
    return `Page ${start}`;
  }

  return `Pages ${start}-${end}`;
}

function getChunkMetaItems(chunk: DocumentChunkSummary) {
  return [
    `#${chunk.chunkIndex + 1}`,
    chunk.chunkType ?? 'chunk',
    formatChunkPageLabel(chunk),
    chunk.tokenCount !== null ? `${chunk.tokenCount} tokens` : null,
    chunk.citationPrecision,
  ].filter((item): item is string => item !== null && item.length > 0);
}

export function DocumentChunkList({ chunks }: { chunks: DocumentChunkSummary[] }) {
  if (chunks.length === 0) {
    return (
      <Flex
        h="full"
        minH="64"
        align="center"
        justify="center"
        rounded="lg"
        borderWidth="1px"
        borderStyle="dashed"
        borderColor="border.surface"
        bg="bg.surface"
        px="6"
        textAlign="center"
      >
        <Box>
          <Text fontSize="sm" fontWeight="semibold" color="fg">
            No chunks stored
          </Text>
          <Text mt="1" fontSize="sm" color="fg.muted">
            Chunks will appear after document processing completes.
          </Text>
        </Box>
      </Flex>
    );
  }

  return (
    <Flex direction="column" gap="3">
      {chunks.map((chunk) => (
        <Box
          key={chunk.id}
          rounded="lg"
          borderWidth="1px"
          borderColor="border.surface"
          bg="bg.surface"
          px={{ base: '4', md: '5' }}
          py="4"
        >
          <Flex align="flex-start" justify="space-between" gap="4">
            <Box minW="0">
              <Text fontSize="sm" fontWeight="semibold" color="fg" truncate>
                {chunk.section ?? `Chunk ${chunk.chunkIndex + 1}`}
              </Text>
              {chunk.sectionPath !== null && chunk.sectionPath.length > 1 ? (
                <Text mt="0.5" fontSize="xs" color="fg.muted" truncate>
                  {chunk.sectionPath.join(' / ')}
                </Text>
              ) : null}
            </Box>
            <Text flexShrink={0} fontSize="xs" fontWeight="medium" color="fg.muted">
              {chunk.parserEngine ?? 'parser'}
            </Text>
          </Flex>
          <Flex mt="3" flexWrap="wrap" gap="1.5">
            {getChunkMetaItems(chunk).map((item) => (
              <Box
                key={item}
                as="span"
                rounded="md"
                borderWidth="1px"
                borderColor="border.surface"
                bg="bg.subtle"
                px="2"
                py="0.5"
                fontSize="xs"
                color="fg.muted"
              >
                {item}
              </Box>
            ))}
          </Flex>
          <Text
            mt="3"
            fontFamily="document"
            fontSize="sm"
            lineHeight="var(--arkivra-line-height-body)"
            color="fg"
            whiteSpace="pre-wrap"
            overflowWrap="anywhere"
          >
            {chunk.content}
          </Text>
        </Box>
      ))}
    </Flex>
  );
}
