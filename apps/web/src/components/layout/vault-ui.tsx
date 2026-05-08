import type { ComponentProps, PropsWithChildren, ReactNode } from 'react';
import {
  Box,
  Flex,
  Grid,
  Heading,
  HStack,
  Stack,
  Text,
} from '@chakra-ui/react';

export const vaultInputClassName = 'vault-input';

export function PageIntro({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <Flex
      as="header"
      direction={{ base: 'column', lg: 'row' }}
      align={{ base: 'stretch', lg: 'flex-end' }}
      justify="space-between"
      gap="3"
      borderBottomWidth="1px"
      borderColor="border.subtle"
      pb="5"
    >
      <Stack gap="2">
        {eyebrow ? <Text textStyle="label">{eyebrow}</Text> : null}
        <Stack gap="2">
          <Heading as="h1" textStyle="3xl" fontWeight="semibold" lineHeight="short">
            {title}
          </Heading>
          {description ? (
            typeof description === 'string' || typeof description === 'number'
              ? (
                  <Text maxW="2xl" textStyle="sm" color="fg.muted">
                    {description}
                  </Text>
                )
              : (
                  <Box maxW="2xl" color="fg.muted">
                    {description}
                  </Box>
                )
          ) : null}
        </Stack>
      </Stack>

      {actions ? (
        <HStack gap="2" flexWrap="wrap">
          {actions}
        </HStack>
      ) : null}
    </Flex>
  );
}

export function SectionHeader({
  eyebrow,
  title,
  action,
}: {
  eyebrow: string;
  title: string;
  action?: ReactNode;
}) {
  return (
    <Flex align="flex-end" justify="space-between" gap="4">
      <Stack gap="1.5">
        <Text textStyle="label">{eyebrow}</Text>
        <Heading as="h2" textStyle="lg" fontWeight="semibold" lineHeight="short">
          {title}
        </Heading>
      </Stack>
      {action}
    </Flex>
  );
}

export const SectionTitle = SectionHeader;

export function SurfacePanel({
  className,
  variant = 'default',
  children,
  ...props
}: PropsWithChildren<{
  className?: string;
  variant?: 'default' | 'soft' | 'subtle' | 'raised' | 'strong';
} & Omit<ComponentProps<typeof Box>, 'children'>>) {
  const panelProps =
    variant === 'strong'
      ? { bg: 'bg.inverted', color: 'fg.inverted' }
      : {
          borderWidth: '1px',
          borderColor: variant === 'raised' ? 'border' : 'border.subtle',
          bg: variant === 'soft' || variant === 'subtle' ? 'bg.subtle' : 'bg.surface',
          shadow: variant === 'raised' ? 'lg' : 'sm',
        };

  return (
    <Box rounded="lg" p="4" className={className} {...panelProps} {...props}>
      {children}
    </Box>
  );
}

export function StatCard({
  label,
  value,
  meta,
  icon,
  className,
}: {
  label: string;
  value: ReactNode;
  meta?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <SurfacePanel className={className}>
      <Stack h="full" justify="space-between" gap="3">
        <Flex align="flex-start" justify="space-between" gap="4">
          <Stack gap="1">
            <Text textStyle="label">{label}</Text>
            <Box fontFamily="heading" fontSize="xl" fontWeight="semibold" color="fg">
              {value}
            </Box>
          </Stack>
          {icon ? (
            <Flex
              boxSize="9"
              shrink="0"
              align="center"
              justify="center"
              rounded="lg"
              bg="teal.subtle"
              color="teal.fg"
            >
              {icon}
            </Flex>
          ) : null}
        </Flex>
        {meta ? <Text textStyle="sm">{meta}</Text> : null}
      </Stack>
    </SurfacePanel>
  );
}

export function EmptyState({
  title,
  description,
  icon,
  action,
  className,
}: {
  title?: ReactNode;
  description: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <Stack
      align="center"
      gap="3"
      rounded="lg"
      borderWidth="1px"
      borderStyle="dashed"
      borderColor="border"
      bg="bg.surface"
      color="fg.muted"
      p="4"
      textAlign="center"
      className={className}
    >
      {icon}
      {title ? <Text fontWeight="semibold" color="fg">{title}</Text> : null}
      <Text textStyle="sm" color="fg.muted">{description}</Text>
      {action}
    </Stack>
  );
}

export function Toolbar({
  children,
  className,
}: PropsWithChildren<{ className?: string }>) {
  return (
    <Flex
      direction={{ base: 'column', xl: 'row' }}
      gap="3"
      rounded="lg"
      borderWidth="1px"
      borderColor="border.subtle"
      bg="bg.surface"
      p="4"
      className={className}
    >
      {children}
    </Flex>
  );
}

export function MetadataGrid({
  children,
  className,
}: PropsWithChildren<{ className?: string }>) {
  return (
    <Grid gap="4" templateColumns={{ base: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }} className={className}>
      {children}
    </Grid>
  );
}

export function DocumentList({
  children,
  className,
}: PropsWithChildren<{ className?: string }>) {
  return (
    <Stack gap="0" divideY="1px" divideColor="border.subtle" className={className}>
      {children}
    </Stack>
  );
}

export function ChatShell({
  children,
  className,
}: PropsWithChildren<{ className?: string }>) {
  return (
    <Grid minH="0" overflow="hidden" className={className}>
      {children}
    </Grid>
  );
}
