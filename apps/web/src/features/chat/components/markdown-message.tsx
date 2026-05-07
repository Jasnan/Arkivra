import type { ReactNode } from 'react';
import { Box, Flex, Text } from '@chakra-ui/react';
import type { Citation } from '../chat.types';
import { WINDOWS_NEWLINE_PATTERN, ORDERED_LIST_PREFIX_PATTERN, renderInlineMarkdown } from './chat-utils';

export function MarkdownMessage({
  content,
  citations,
  onCitationClick,
}: {
  content: string;
  citations: Citation[];
  onCitationClick?: (citation: Citation) => void;
}) {
  const lines = content.replace(WINDOWS_NEWLINE_PATTERN, '\n').split('\n');
  const blocks: ReactNode[] = [];
  let paragraphLines: string[] = [];
  let listItems: { type: 'ul' | 'ol'; content: string }[] = [];
  let codeFenceLines: string[] = [];
  let inCodeFence = false;

  function flushParagraph() {
    if (paragraphLines.length === 0) return;
    blocks.push(
      <Text key={`p-${blocks.length}`} whiteSpace="pre-wrap">
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
        pl="5"
        listStyleType={isOrdered ? 'decimal' : 'disc'}
      >
        {listItems.map((item) => (
          <Box as="li" key={`${item.type}-${item.content}`}>
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
        <Text key={`heading-${blocks.length}`} fontSize={fontSize} fontWeight="semibold">
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
    <Flex direction="column" gap="4">
      {blocks}
    </Flex>
  );
}
