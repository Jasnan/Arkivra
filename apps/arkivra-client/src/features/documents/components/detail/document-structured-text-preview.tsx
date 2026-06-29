import { useMemo } from 'react';
import { Box } from '@chakra-ui/react';
import { PrismLight as SyntaxHighlighter } from 'react-syntax-highlighter';
import bash from 'react-syntax-highlighter/dist/esm/languages/prism/bash';
import docker from 'react-syntax-highlighter/dist/esm/languages/prism/docker';
import ini from 'react-syntax-highlighter/dist/esm/languages/prism/ini';
import javascript from 'react-syntax-highlighter/dist/esm/languages/prism/javascript';
import json from 'react-syntax-highlighter/dist/esm/languages/prism/json';
import markdown from 'react-syntax-highlighter/dist/esm/languages/prism/markdown';
import markup from 'react-syntax-highlighter/dist/esm/languages/prism/markup';
import sql from 'react-syntax-highlighter/dist/esm/languages/prism/sql';
import toml from 'react-syntax-highlighter/dist/esm/languages/prism/toml';
import tsx from 'react-syntax-highlighter/dist/esm/languages/prism/tsx';
import typescript from 'react-syntax-highlighter/dist/esm/languages/prism/typescript';
import yaml from 'react-syntax-highlighter/dist/esm/languages/prism/yaml';
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useAccentColor } from '@/components/providers/accent-color-context';
import {
  getStructuredTextDisplayText,
  getStructuredTextLanguage,
} from './document-structured-text-preview.utils';

SyntaxHighlighter.registerLanguage('bash', bash);
SyntaxHighlighter.registerLanguage('docker', docker);
SyntaxHighlighter.registerLanguage('ini', ini);
SyntaxHighlighter.registerLanguage('javascript', javascript);
SyntaxHighlighter.registerLanguage('json', json);
SyntaxHighlighter.registerLanguage('markdown', markdown);
SyntaxHighlighter.registerLanguage('sql', sql);
SyntaxHighlighter.registerLanguage('toml', toml);
SyntaxHighlighter.registerLanguage('tsx', tsx);
SyntaxHighlighter.registerLanguage('typescript', typescript);
SyntaxHighlighter.registerLanguage('xml', markup);
SyntaxHighlighter.registerLanguage('yaml', yaml);

export function DocumentStructuredTextPreview({
  content,
  mimeType,
  name,
  originalName,
}: {
  content: string;
  mimeType: string;
  name: string;
  originalName: string;
}) {
  const { themeMode } = useAccentColor();
  const language = getStructuredTextLanguage({ mimeType, name, originalName }) ?? 'markdown';
  const displayText = useMemo(
    () => getStructuredTextDisplayText({ content, language }),
    [content, language],
  );
  const isDark = themeMode === 'dark';

  return (
    <Box
      h="full"
      minH={{ base: '720px', md: '0' }}
      overflow="auto"
      rounded="lg"
      borderWidth="1px"
      borderColor="border.surface"
      bg={{ base: 'bg.surface', _dark: 'gray.950' }}
      css={{
        '& pre, & code': {
          fontFamily: 'var(--arkivra-font-document)',
          letterSpacing: '0',
        },
        '& code': {
          whiteSpace: 'pre',
        },
      }}
    >
      <SyntaxHighlighter
        language={language}
        style={isDark ? oneDark : oneLight}
        showLineNumbers
        wrapLongLines={false}
        customStyle={{
          minHeight: '100%',
          margin: 0,
          overflow: 'visible',
          background: 'transparent',
          fontSize: '0.875rem',
          lineHeight: '1.65',
          padding: '1.25rem 1.5rem',
        }}
        codeTagProps={{
          style: {
            fontFamily: 'var(--arkivra-font-document)',
          },
        }}
        lineNumberStyle={{
          minWidth: '2.75em',
          paddingRight: '1.25em',
          color: isDark ? '#6b7280' : '#9ca3af',
          userSelect: 'none',
        }}
      >
        {displayText}
      </SyntaxHighlighter>
    </Box>
  );
}
