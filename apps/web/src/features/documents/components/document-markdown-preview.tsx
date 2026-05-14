import { Box, Heading, Text, chakra } from '@chakra-ui/react';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';

const markdownComponents: Components = {
  h1({ node: _node, ...props }) {
    return <Heading as="h1" mt="0" mb="4" textStyle="2xl" color="fg" {...props} />;
  },
  h2({ node: _node, ...props }) {
    return <Heading as="h2" mt="7" mb="3" textStyle="xl" color="fg" {...props} />;
  },
  h3({ node: _node, ...props }) {
    return <Heading as="h3" mt="6" mb="2" textStyle="lg" color="fg" {...props} />;
  },
  h4({ node: _node, ...props }) {
    return <Heading as="h4" mt="5" mb="2" textStyle="md" color="fg" {...props} />;
  },
  h5({ node: _node, ...props }) {
    return <Heading as="h5" mt="4" mb="2" textStyle="sm" color="fg" {...props} />;
  },
  h6({ node: _node, ...props }) {
    return <Heading as="h6" mt="4" mb="2" textStyle="xs" color="fg.muted" {...props} />;
  },
  p({ node: _node, ...props }) {
    return <Text mb="4" lineHeight="7" color="fg" overflowWrap="anywhere" {...props} />;
  },
  a({ node: _node, ...props }) {
    return (
      <chakra.a
        color="teal.fg"
        fontWeight="medium"
        overflowWrap="anywhere"
        textDecoration="underline"
        textUnderlineOffset="3px"
        target="_blank"
        rel="noreferrer"
        {...props}
      />
    );
  },
  ul({ node: _node, ...props }) {
    return <chakra.ul mb="4" ps="6" display="grid" gap="1.5" listStyleType="disc" {...props} />;
  },
  ol({ node: _node, ...props }) {
    return <chakra.ol mb="4" ps="6" display="grid" gap="1.5" listStyleType="decimal" {...props} />;
  },
  li({ node: _node, ...props }) {
    return <chakra.li lineHeight="7" color="fg" overflowWrap="anywhere" {...props} />;
  },
  blockquote({ node: _node, ...props }) {
    return (
      <chakra.blockquote
        mb="4"
        borderLeftWidth="3px"
        borderColor="teal.solid"
        bg="bg.subtle"
        px="4"
        py="3"
        color="fg.muted"
        fontStyle="italic"
        {...props}
      />
    );
  },
  hr({ node: _node, ...props }) {
    return <chakra.hr my="6" borderColor="border.subtle" {...props} />;
  },
  table({ node: _node, ...props }) {
    return (
      <Box mb="5" maxW="full" overflowX="auto">
        <chakra.table w="full" minW="max-content" borderCollapse="collapse" fontSize="sm" {...props} />
      </Box>
    );
  },
  th({ node: _node, ...props }) {
    return (
      <chakra.th
        borderWidth="1px"
        borderColor="border.subtle"
        bg="bg.subtle"
        px="3"
        py="2"
        textAlign="start"
        fontWeight="semibold"
        color="fg"
        {...props}
      />
    );
  },
  td({ node: _node, ...props }) {
    return (
      <chakra.td
        borderWidth="1px"
        borderColor="border.subtle"
        px="3"
        py="2"
        color="fg"
        {...props}
      />
    );
  },
  pre({ node: _node, ...props }) {
    return (
      <chakra.pre
        mb="5"
        maxW="full"
        overflowX="auto"
        rounded="md"
        borderWidth="1px"
        borderColor="border.subtle"
        bg="bg.subtle"
        p="4"
        fontFamily="mono"
        fontSize="sm"
        lineHeight="6"
        color="fg"
        {...props}
      />
    );
  },
  code({ node: _node, ...props }) {
    return (
      <chakra.code
        rounded="sm"
        bg="bg.subtle"
        px="1"
        py="0.5"
        fontFamily="mono"
        fontSize="0.92em"
        color="fg"
        {...props}
      />
    );
  },
};

export function DocumentMarkdownPreview({ markdown }: { markdown: string }) {
  return (
    <Box color="fg" fontSize="sm">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        components={markdownComponents}
      >
        {markdown}
      </ReactMarkdown>
    </Box>
  );
}
