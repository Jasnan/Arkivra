import type { ReactNode } from 'react';
import { Box, Flex, Text } from '@chakra-ui/react';
import type { Citation } from '../chat.types';
import { WINDOWS_NEWLINE_PATTERN, ORDERED_LIST_PREFIX_PATTERN, renderInlineMarkdown } from './chat-utils';

export function normalizeChatDisplayContent(content: string) {
  return content
    .replace(WINDOWS_NEWLINE_PATTERN, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

export function MarkdownMessage({
  content,
  citations,
  onCitationClick,
}: {
  content: string;
  citations: Citation[];
  onCitationClick?: (citation: Citation) => void;
}) {
  const lines = normalizeChatDisplayContent(content).split('\n');
  const blocks: ReactNode[] = [];
  let paragraphLines: string[] = [];
  let listItems: { type: 'ul' | 'ol'; content: string }[] = [];
  let codeFenceLines: string[] = [];
  let inCodeFence = false;

  function flushParagraph() {
    if (paragraphLines.length === 0) return;
    blocks.push(
      <Text key={`p-${blocks.length}`} minW="0" whiteSpace="pre-wrap" overflowWrap="anywhere">
        {renderInlineMarkdown({ text: paragraphLines.join(' '), citations, onCitationClick })}
      </Text>,
    );
    paragraphLines = [];
  }

  function flushList() {
    if (listItems.length === 0) return;
    const isOrdered = listItems[0]?.type === 'ol';
    blocks.push(
      <Flex
        key={`list-${blocks.length}`}
        as={isOrdered ? 'ol' : 'ul'}
        direction="column"
        gap="1"
        minW="0"
        pl="5"
        listStyleType={isOrdered ? 'decimal' : 'disc'}
      >
        {listItems.map((item) => (
          <Box as="li" key={`${item.type}-${item.content}`} minW="0" overflowWrap="anywhere">
            {renderInlineMarkdown({ text: item.content, citations, onCitationClick })}
          </Box>
        ))}
      </Flex>,
    );
    listItems = [];
  }

  function flushCodeFence() {
    if (codeFenceLines.length === 0) return;
    blocks.push(
      <Box
        key={`code-${blocks.length}`}
        as="pre"
        maxW="full"
        overflowX="auto"
        rounded="lg"
        bg="bg.subtle"
        p="3"
        fontFamily="mono"
        fontSize="sm"
      >
        <code>{codeFenceLines.join('\n')}</code>
      </Box>,
    );
    codeFenceLines = [];
  }

  for (const line of lines) {
    const trimmedLine = line.trim();

    if (trimmedLine.startsWith('```')) {
      flushParagraph();
      flushList();
      if (inCodeFence) flushCodeFence();
      inCodeFence = !inCodeFence;
      continue;
    }

    if (inCodeFence) {
      codeFenceLines.push(line);
      continue;
    }

    if (trimmedLine.length === 0) {
      flushParagraph();
      flushList();
      continue;
    }

    const headingText = line.startsWith('### ')
      ? line.slice(4)
      : line.startsWith('## ')
        ? line.slice(3)
        : line.startsWith('# ')
          ? line.slice(2)
          : null;
    if (headingText !== null) {
      flushParagraph();
      flushList();
      const level = line.startsWith('### ') ? 3 : line.startsWith('## ') ? 2 : 1;
      const fontSize = level === 1 ? 'xl' : level === 2 ? 'lg' : 'base';
      blocks.push(
        <Text key={`heading-${blocks.length}`} minW="0" fontSize={fontSize} fontWeight="semibold" overflowWrap="anywhere">
          {renderInlineMarkdown({ text: headingText, citations, onCitationClick })}
        </Text>,
      );
      continue;
    }

    const orderedMarkerIndex = line.indexOf('. ');
    const orderedPrefix = orderedMarkerIndex > 0 ? line.slice(0, orderedMarkerIndex) : '';
    const orderedContent = orderedMarkerIndex > 0 ? line.slice(orderedMarkerIndex + 2) : '';
    if (ORDERED_LIST_PREFIX_PATTERN.test(orderedPrefix) && orderedContent.length > 0) {
      flushParagraph();
      listItems.push({ type: 'ol', content: orderedContent });
      continue;
    }

    if ((line.startsWith('- ') || line.startsWith('* ')) && line.slice(2).trim().length > 0) {
      flushParagraph();
      listItems.push({ type: 'ul', content: line.slice(2) });
      continue;
    }

    if (line.startsWith('> ')) {
      flushParagraph();
      flushList();
      blocks.push(
        <Box
          key={`quote-${blocks.length}`}
          as="blockquote"
          borderLeftWidth="2px"
          borderColor="border"
          pl="4"
          minW="0"
          fontStyle="italic"
          color="fg.muted"
        >
          {renderInlineMarkdown({ text: line.slice(2), citations, onCitationClick })}
        </Box>,
      );
      continue;
    }

    paragraphLines.push(line.trim());
  }

  flushParagraph();
  flushList();
  flushCodeFence();

  return (
    <Flex direction="column" gap="2" minW="0" maxW="full" overflowWrap="anywhere">
      {blocks}
    </Flex>
  );
}
