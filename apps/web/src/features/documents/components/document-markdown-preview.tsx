import { Box, chakra } from '@chakra-ui/react';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
import { Prose } from '@/components/ui/prose';

const markdownComponents: Components = {
  a({ node: _node, ...props }) {
    return (
      <chakra.a
        target="_blank"
        rel="noreferrer"
        {...props}
      />
    );
  },
  table({ node: _node, ...props }) {
    return (
      <Box my="5" maxW="full" overflowX="auto">
        <chakra.table {...props} />
      </Box>
    );
  },
};

export function DocumentMarkdownPreview({ markdown }: { markdown: string }) {
  return (
    <Prose className="arkivra-document-content" maxW="none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        components={markdownComponents}
      >
        {markdown}
      </ReactMarkdown>
    </Prose>
  );
}
