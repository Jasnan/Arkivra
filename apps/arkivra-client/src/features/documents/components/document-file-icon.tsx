import { Box, Flex, chakra } from '@chakra-ui/react';
import { getDocumentFileIconMeta } from './document-file-icon.utils';
import type { DocumentFileIconMeta } from './document-file-icon.utils';

export function DocumentFileIconGlyph({ meta, iconSize = 18, strokeWidth = 1.8 }: {
  meta: DocumentFileIconMeta;
  iconSize?: number;
  strokeWidth?: number;
}) {
  if (meta.iconKind === 'svg') {
    return (
      <chakra.span
        aria-hidden="true"
        display="inline-block"
        boxSize={`${iconSize}px`}
        lineHeight="0"
        css={{
          '& svg': {
            display: 'block',
            height: '100%',
            width: '100%',
          },
        }}
        // eslint-disable-next-line react-dom/no-dangerously-set-innerhtml -- Local file-type SVG assets are rendered inline so currentColor follows the file icon token.
        dangerouslySetInnerHTML={{ __html: meta.iconSvg }}
      />
    );
  }

  const Icon = meta.icon;
  return <Icon size={iconSize} strokeWidth={strokeWidth} />;
}

export function DocumentFileIcon({
  name,
  mimeType,
  iconSize = 18,
  boxSize = '5',
}: {
  name: string;
  mimeType: string;
  iconSize?: number;
  boxSize?: string;
  showBadge?: boolean;
}) {
  const meta = getDocumentFileIconMeta({ name, mimeType });

  return (
    <Flex boxSize={boxSize} shrink={0} align="center" justify="center" color={meta.color} aria-hidden="true">
      <Box boxSize={boxSize} color={meta.color} display="flex" alignItems="center" justifyContent="center">
        <DocumentFileIconGlyph meta={meta} iconSize={iconSize} />
      </Box>
    </Flex>
  );
}
