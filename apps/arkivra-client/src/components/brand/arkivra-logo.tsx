import type { HTMLChakraProps } from '@chakra-ui/react';
import { chakra } from '@chakra-ui/react';
import arkivraLogoSvg from '@/assets/arkivra-sidebar-logo.svg?raw';

export function ArkivraLogo({ title, ...props }: HTMLChakraProps<'span'> & { title?: string }) {
  return (
    <chakra.span
      aria-hidden={title ? undefined : true}
      aria-label={title}
      role={title ? 'img' : undefined}
      display="inline-block"
      lineHeight="0"
      css={{
        '& svg': {
          display: 'block',
          height: '100%',
          width: '100%',
        },
      }}
      // eslint-disable-next-line react-dom/no-dangerously-set-innerhtml -- Local SVG asset rendered inline so currentColor can follow the app accent token.
      dangerouslySetInnerHTML={{ __html: arkivraLogoSvg }}
      {...props}
    />
  );
}
