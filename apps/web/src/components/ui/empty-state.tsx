import type { ComponentProps, ReactNode } from 'react';
import {
  AbsoluteCenter,
  Box,
  EmptyState as ChakraEmptyState,
  Stack,
} from '@chakra-ui/react';

type AppEmptyStateProps = Omit<ComponentProps<typeof ChakraEmptyState.Root>, 'title'> & {
  title?: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
};

type CenteredEmptyStateProps = AppEmptyStateProps & {
  containerProps?: ComponentProps<typeof Box>;
  centerProps?: ComponentProps<typeof AbsoluteCenter>;
};

export function AppEmptyState({
  title,
  description,
  icon,
  action,
  children,
  ...props
}: AppEmptyStateProps) {
  return (
    <ChakraEmptyState.Root {...props}>
      <ChakraEmptyState.Content gap="3" textAlign="center">
        {icon ? (
          <ChakraEmptyState.Indicator color="fg.muted">
            {icon}
          </ChakraEmptyState.Indicator>
        ) : null}
        {title || description ? (
          <Stack gap="1" maxW="32rem" textAlign="center">
            {title ? (
              <ChakraEmptyState.Title fontSize="md" fontWeight="semibold" lineHeight="1.35" color="fg">
                {title}
              </ChakraEmptyState.Title>
            ) : null}
            {description ? (
              <ChakraEmptyState.Description fontSize="sm" lineHeight="1.55" color="fg.muted">
                {description}
              </ChakraEmptyState.Description>
            ) : null}
          </Stack>
        ) : null}
        {action}
        {children}
      </ChakraEmptyState.Content>
    </ChakraEmptyState.Root>
  );
}

export function CenteredEmptyState({
  containerProps,
  centerProps,
  ...props
}: CenteredEmptyStateProps) {
  return (
    <Box position="relative" minH="22rem" {...containerProps}>
      <AbsoluteCenter axis="both" w="full" px="4" {...centerProps}>
        <AppEmptyState {...props} />
      </AbsoluteCenter>
    </Box>
  );
}
