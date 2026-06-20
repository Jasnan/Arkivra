import type { HTMLChakraProps } from '@chakra-ui/react';
import { chakra } from '@chakra-ui/react';
import arkivraLogoUrl from '@/assets/arkivra-sidebar-logo.svg';

export function ArkivraLogo({ title, ...props }: HTMLChakraProps<'img'> & { title?: string }) {
  return (
    <chakra.img
      src={arkivraLogoUrl}
      alt={title ?? ''}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      role={title ? undefined : 'presentation'}
      display="inline-block"
      lineHeight="0"
      {...props}
    />
  );
}
