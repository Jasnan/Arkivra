/* eslint-disable react-refresh/only-export-components */
import type { CSSProperties, ReactNode } from 'react';
import { Children } from 'react';
import { Box, Flex, Text } from '@chakra-ui/react';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { Citation } from '../chat.types';
import { pageRange, WINDOWS_NEWLINE_PATTERN } from './chat-utils';

const TRAILING_LINE_WHITESPACE_PATTERN = /[ \t]+\n/g;
const LEADING_LINE_WHITESPACE_PATTERN = /\n[ \t]+/g;
const REPEATED_NEWLINE_PATTERN = /\n{3,}/g;
const CITATION_MARKER_PATTERN = /\[(\d+)\]/g;

const citationMarkerButtonStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  borderRadius: '9999px',
  border: '1px solid var(--chakra-colors-border-subtle)',
  backgroundColor: 'color-mix(in srgb, var(--chakra-colors-bg-subtle), transparent 35%)',
  padding: '0.1rem 0.5rem',
  verticalAlign: 'baseline',
  fontSize: '0.78rem',
  fontWeight: 600,
  color: 'var(--chakra-colors-fg)',
  margin: '0 0.125rem',
  cursor: 'pointer',
} satisfies CSSProperties;

export function normalizeChatDisplayContent(content: string) {
  return content
    .replace(WINDOWS_NEWLINE_PATTERN, '\n')
    .replace(TRAILING_LINE_WHITESPACE_PATTERN, '\n')
    .replace(LEADING_LINE_WHITESPACE_PATTERN, '\n')
    .replace(REPEATED_NEWLINE_PATTERN, '\n\n')
    .trim();
}

export function projectInlineCitationsForDisplay({
  content,
  citations,
}: {
  content: string;
  citations: Citation[];
}) {
  if (content.length === 0 || citations.length === 0) {
    return { content, citations: [] };
  }

  const remappedCitationNumbers = new Map<number, number>();
  const displayCitations: Citation[] = [];
  const displayContent = content.replace(CITATION_MARKER_PATTERN, (marker, rawCitationNumber) => {
    const citationNumber = Number(rawCitationNumber);
    if (!Number.isSafeInteger(citationNumber) || citationNumber < 1) {
      return marker;
    }

    const citationIndex = citationNumber - 1;
    const citation = citations[citationIndex];
    if (citation === undefined) {
      return marker;
    }

    let displayCitationNumber = remappedCitationNumbers.get(citationIndex);
    if (displayCitationNumber === undefined) {
      displayCitations.push(citation);
      displayCitationNumber = displayCitations.length;
      remappedCitationNumbers.set(citationIndex, displayCitationNumber);
    }

    return `[${displayCitationNumber}]`;
  });

  return { content: displayContent, citations: displayCitations };
}

function CitationMarker({
  citation,
  citationNumber,
  onCitationClick,
}: {
  citation: Citation;
  citationNumber: number;
  onCitationClick: (citation: Citation) => void;
}) {
  const snippet = citation.snippet.trim();
  const marker = `[${citationNumber}]`;
  const button = (
    <button
      type="button"
      onClick={() => onCitationClick(citation)}
      style={citationMarkerButtonStyle}
    >
      {marker}
    </button>
  );

  if (snippet.length === 0) {
    return button;
  }

  return (
    <Tooltip openDelay={120} closeDelay={0} positioning={{ placement: 'top' }}>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent maxW="22rem" color="fg">
        <Flex direction="column" gap="1.5" minW="0">
          <Text fontSize="xs" fontWeight="semibold" color="fg" overflowWrap="anywhere">
            {citation.documentName}
          </Text>
          <Text fontSize="xs" color="fg.muted">
            {pageRange(citation)}
          </Text>
          <Text fontSize="xs" lineHeight="1.5" color="fg.muted" lineClamp="5" overflowWrap="anywhere">
            {snippet}
          </Text>
        </Flex>
      </TooltipContent>
    </Tooltip>
  );
}

function renderTextWithCitations({
  value,
  citations,
  onCitationClick,
}: {
  value: string;
  citations: Citation[];
  onCitationClick?: (citation: Citation) => void;
}) {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;

  for (const match of value.matchAll(CITATION_MARKER_PATTERN)) {
    const index = match.index ?? 0;
    const citationNumber = Number(match[1]);
    if (index > lastIndex) {
      nodes.push(value.slice(lastIndex, index));
    }

    const citation = Number.isInteger(citationNumber) ? citations[citationNumber - 1] : undefined;
    if (citation && onCitationClick) {
      nodes.push(
        <CitationMarker
          key={`citation-${index}-${citationNumber}`}
          citation={citation}
          citationNumber={citationNumber}
          onCitationClick={onCitationClick}
        />,
      );
    } else {
      nodes.push(`[${citationNumber}]`);
    }

    lastIndex = index + match[0].length;
  }

  if (lastIndex < value.length) {
    nodes.push(value.slice(lastIndex));
  }

  return nodes.length > 0 ? nodes : value;
}

function renderChildrenWithCitations({
  children,
  citations,
  onCitationClick,
}: {
  children: ReactNode;
  citations: Citation[];
  onCitationClick?: (citation: Citation) => void;
}): ReactNode {
  if (typeof children === 'string') {
    return renderTextWithCitations({ value: children, citations, onCitationClick });
  }

  if (Array.isArray(children)) {
    return Children.toArray(children).map(child =>
      renderChildrenWithCitations({ children: child, citations, onCitationClick }));
  }

  return children;
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
  const components: Components = {
    p({ children }) {
      return (
        <Text minW="0" whiteSpace="pre-wrap" overflowWrap="anywhere">
          {renderChildrenWithCitations({ children, citations, onCitationClick })}
        </Text>
      );
    },
    ul({ children }) {
      return (
        <Flex as="ul" direction="column" gap="1" minW="0" pl="5" listStyleType="disc">
          {children}
        </Flex>
      );
    },
    ol({ children }) {
      return (
        <Flex as="ol" direction="column" gap="1" minW="0" pl="5" listStyleType="decimal">
          {children}
        </Flex>
      );
    },
    li({ children }) {
      return (
        <Box as="li" minW="0" overflowWrap="anywhere">
          {renderChildrenWithCitations({ children, citations, onCitationClick })}
        </Box>
      );
    },
    h1({ children }) {
      return (
        <Text minW="0" fontSize="xl" fontWeight="semibold" overflowWrap="anywhere">
          {renderChildrenWithCitations({ children, citations, onCitationClick })}
        </Text>
      );
    },
    h2({ children }) {
      return (
        <Text minW="0" fontSize="lg" fontWeight="semibold" overflowWrap="anywhere">
          {renderChildrenWithCitations({ children, citations, onCitationClick })}
        </Text>
      );
    },
    h3({ children }) {
      return (
        <Text minW="0" fontSize="base" fontWeight="semibold" overflowWrap="anywhere">
          {renderChildrenWithCitations({ children, citations, onCitationClick })}
        </Text>
      );
    },
    blockquote({ children }) {
      return (
        <Box as="blockquote" borderLeftWidth="2px" borderColor="border" pl="4" minW="0" fontStyle="italic" color="fg.muted">
          {renderChildrenWithCitations({ children, citations, onCitationClick })}
        </Box>
      );
    },
    code({ children, className }) {
      const isInline = !className;
      if (isInline) {
        return (
          <Box
            as="code"
            rounded="sm"
            bg="bg.subtle"
            px="1.5"
            py="0.5"
            fontFamily="mono"
            fontSize="0.95em"
          >
            {children}
          </Box>
        );
      }

      return (
        <Box
          as="code"
          display="block"
          minW="max-content"
          fontFamily="mono"
          fontSize="sm"
        >
          {children}
        </Box>
      );
    },
    pre({ children }) {
      return (
        <Box as="pre" maxW="full" overflowX="auto" rounded="lg" bg="bg.subtle" p="3">
          {children}
        </Box>
      );
    },
  };

  return (
    <Flex direction="column" gap="2" minW="0" maxW="full" overflowWrap="anywhere">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        components={components}
      >
        {normalizeChatDisplayContent(content)}
      </ReactMarkdown>
    </Flex>
  );
}
