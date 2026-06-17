import type { ComponentProps, ReactNode } from 'react';
import { Text } from '@chakra-ui/react';

export function WorkspacePageTitle({
  children,
  ...props
}: {
  children: ReactNode;
} & ComponentProps<typeof Text>) {
  return (
    <Text
      as="h1"
      flexShrink={0}
      fontSize="lg"
      fontWeight="semibold"
      lineHeight="1.2"
      color="fg"
      {...props}
    >
      {children}
    </Text>
  );
}
