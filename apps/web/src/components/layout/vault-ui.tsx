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
          <Heading as="h1" textStyle="page.title">
            {title}
          </Heading>
          {description ? (
            typeof description === 'string' || typeof description === 'number'
              ? (
                  <Text maxW="2xl" textStyle="body" color="text.muted">
                    {description}
                  </Text>
                )
              : (
                  <Box maxW="2xl" color="text.muted">
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
        <Heading as="h2" textStyle="section.title">
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
  const layerStyle =
    variant === 'soft' || variant === 'subtle'
      ? 'ark.panel.subtle'
      : variant === 'raised'
        ? 'ark.panel.raised'
        : variant === 'strong'
          ? 'ark.panel.strong'
          : 'ark.panel';

  return (
    <Box layerStyle={layerStyle} p="4" className={className} {...props}>
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
            <Box fontFamily="heading" fontSize="xl" fontWeight="semibold" color="text.default">
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
              bg="accent.subtle"
              color="accent.fg"
            >
              {icon}
            </Flex>
          ) : null}
        </Flex>
        {meta ? <Text textStyle="metadata">{meta}</Text> : null}
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
    <Stack layerStyle="ark.empty" align="center" gap="3" textAlign="center" className={className}>
      {icon}
      {title ? <Text fontWeight="semibold" color="text.default">{title}</Text> : null}
      <Text textStyle="body" color="text.muted">{description}</Text>
      {action}
    </Stack>
  );
}

export function Toolbar({
  children,
  className,
}: PropsWithChildren<{ className?: string }>) {
  return (
    <Flex layerStyle="ark.toolbar" direction={{ base: 'column', xl: 'row' }} gap="3" className={className}>
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
