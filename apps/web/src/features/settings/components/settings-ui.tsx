import type { ReactNode } from 'react';
import { Box, Flex, Grid, HStack, Heading, Stack, Text } from '@chakra-ui/react';
import { Badge } from '@/components/ui/badge';
import { RadioDropdownMenu } from '@/components/ui/radio-dropdown-menu';
import { Separator } from '@/components/ui/separator';

export type SettingsStatusTone = 'verified' | 'enabled' | 'warning' | 'inactive';

const statusToneStyles: Record<SettingsStatusTone, { bg: string; color: string; label: string }> = {
  verified: { bg: 'bg.success', color: 'fg.success', label: 'Verified' },
  enabled: { bg: 'teal.subtle', color: 'teal.fg', label: 'Enabled' },
  warning: { bg: 'bg.warning', color: 'fg.warning', label: 'Warning' },
  inactive: { bg: 'bg.muted', color: 'fg.subtle', label: 'Inactive' },
};

export function SettingsPageFrame({
  actions,
  children,
  description,
  density = 'default',
  title,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  density?: 'default' | 'compact';
  children: ReactNode;
}) {
  const isCompact = density === 'compact';

  return (
    <Stack
      as="section"
      gap={isCompact ? { base: '4', lg: '3' } : '5'}
      maxW="6xl"
      pb={isCompact ? '6' : '8'}
      pt={isCompact ? { base: '4', lg: '3' } : '5'}
      css={isCompact
        ? {
            '--arkivra-controlHeight': '2.25rem',
            '--arkivra-controlPaddingX': '0.625rem',
            '--arkivra-rowPaddingY': '0.625rem',
            '--arkivra-sectionPadding': '1rem',
          }
        : undefined}
    >
      {title ? (
        <Flex
          as="header"
          direction={{ base: 'column', lg: 'row' }}
          align={{ base: 'stretch', lg: 'flex-end' }}
          justify="space-between"
          gap={isCompact ? '2' : '3'}
        >
          <Stack gap={isCompact ? '1' : '1.5'}>
            <Heading as="h1" textStyle={isCompact ? 'xl' : '2xl'} fontWeight="semibold" lineHeight="short">
              {title}
            </Heading>
            {description ? (
              <Text maxW="2xl" textStyle="sm" color="fg.muted">
                {description}
              </Text>
            ) : null}
          </Stack>
          {actions ? <HStack gap="2">{actions}</HStack> : null}
        </Flex>
      ) : null}

      <Stack gap={isCompact ? '3' : '4'}>{children}</Stack>
    </Stack>
  );
}

export function SettingsSection({
  title,
  description,
  actions,
  children,
  density = 'default',
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  density?: 'default' | 'compact';
}) {
  const isCompact = density === 'compact';

  return (
    <Box rounded="lg" borderWidth="1px" borderColor="border.surface" bg="bg.surface" p="var(--arkivra-sectionPadding, 1.25rem)" shadow="xs">
      <Stack gap={isCompact ? '3' : '4'}>
        <Flex
          direction={{ base: 'column', md: 'row' }}
          align={{ base: 'stretch', md: 'flex-start' }}
          justify="space-between"
          gap={isCompact ? '2' : '3'}
        >
          <Stack gap={isCompact ? '0.5' : '1'}>
            <Heading as="h2" fontSize="md" fontWeight="semibold" lineHeight="short">
              {title}
            </Heading>
            {description ? (
              <Text textStyle="sm" color="fg.muted">
                {description}
              </Text>
            ) : null}
          </Stack>
          {actions ? <HStack flexShrink={0}>{actions}</HStack> : null}
        </Flex>
        {children}
      </Stack>
    </Box>
  );
}

export function SettingsRows({
  children,
  density = 'default',
}: {
  children: ReactNode;
  density?: 'default' | 'compact';
}) {
  return (
    <Stack gap="0" divideY="1px" divideColor={density === 'compact' ? 'border.muted' : 'border.surface'}>
      {children}
    </Stack>
  );
}

export function SettingsFlatRows({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <Stack gap="0" divideY="1px" divideColor="border.muted">
      {children}
    </Stack>
  );
}

export function SettingsFlatRow({
  actions,
  children,
  description,
  icon,
  iconBg = 'bg.muted',
  iconColor = 'fg.muted',
  title,
}: {
  title: ReactNode;
  description?: ReactNode;
  icon: ReactNode;
  iconBg?: string;
  iconColor?: string;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <Grid
      py={{ base: '5', lg: '6' }}
      gap={{ base: '3', md: '4', lg: '5' }}
      templateColumns={{ base: '3rem minmax(0, 1fr)', md: '4rem minmax(0, 1fr) auto' }}
      alignItems="start"
    >
      <Flex
        boxSize="10"
        align="center"
        justify="center"
        rounded="md"
        bg={iconBg}
        color={iconColor}
        flexShrink={0}
        aria-hidden="true"
      >
        {icon}
      </Flex>
      <Stack gap="1" minW="0">
        <Text fontSize="md" fontWeight="semibold" color="fg" lineHeight="short">
          {title}
        </Text>
        {description ? (
          <Text textStyle="sm" color="fg.muted" maxW="2xl">
            {description}
          </Text>
        ) : null}
      </Stack>
      {actions ? (
        <Flex
          gridColumn={{ base: '2', md: 'auto' }}
          justify={{ base: 'flex-start', md: 'flex-end' }}
          align="center"
          minW="0"
          w={{ base: 'full', md: 'auto' }}
        >
          {actions}
        </Flex>
      ) : null}
      {children ? (
        <Box gridColumn={{ base: '2', md: '2 / -1' }} minW="0" w="full">
          {children}
        </Box>
      ) : null}
    </Grid>
  );
}

export function SettingsRow({
  label,
  description,
  meta,
  control,
  density = 'default',
}: {
  label: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
  control?: ReactNode;
  density?: 'default' | 'compact';
}) {
  const isCompact = density === 'compact';

  return (
    <Grid
      gap={{ base: '3', lg: isCompact ? '3' : '5' }}
      py={isCompact ? '2' : 'var(--arkivra-rowPaddingY, 0.875rem)'}
      templateColumns={{ base: '1fr', lg: control ? `minmax(0, 1fr) minmax(${isCompact ? '11rem' : '13rem'}, ${isCompact ? '15rem' : '17rem'})` : '1fr' }}
      alignItems="center"
    >
      <Stack gap={isCompact ? '0.5' : '1'} minW="0">
        <Text fontSize="sm" fontWeight="medium" color="fg">
          {label}
        </Text>
        {description ? (
          <Text textStyle="sm" color="fg.muted">
            {description}
          </Text>
        ) : null}
      </Stack>
      {control ? (
        <Flex justify={{ base: 'flex-start', lg: 'flex-end' }} minW="0" w="full">
          {control}
        </Flex>
      ) : meta ? null : null}
      {meta ? (
        <Box color="fg" fontSize="sm">
          {meta}
        </Box>
      ) : null}
    </Grid>
  );
}

export function KeyValueRows({
  density = 'default',
  rows,
}: {
  density?: 'default' | 'compact';
  rows: Array<{ label: string; value: ReactNode }>;
}) {
  const isCompact = density === 'compact';

  return (
    <Stack gap="0" divideY="1px" divideColor="border.surface">
      {rows.map((row) => (
        <Flex
          key={row.label}
          align="center"
          justify="space-between"
          gap={isCompact ? '3' : '4'}
          py={isCompact ? '2' : 'var(--arkivra-rowPaddingY, 0.875rem)'}
        >
          <Text textStyle="sm" color="fg.muted">
            {row.label}
          </Text>
          <Box minW="0" textAlign="right" fontSize="sm" fontWeight="medium" color="fg">
            {row.value}
          </Box>
        </Flex>
      ))}
    </Stack>
  );
}

export function SettingsStatusBadge({
  density = 'default',
  tone,
  children,
}: {
  density?: 'default' | 'compact';
  tone: SettingsStatusTone;
  children?: ReactNode;
}) {
  const styles = statusToneStyles[tone];
  const isCompact = density === 'compact';

  return (
    <Badge
      variant="secondary"
      bg={styles.bg}
      color={styles.color}
      display="inline-flex"
      alignItems="center"
      gap={isCompact ? '1' : '1.5'}
      rounded="full"
      px={isCompact ? '1.5' : '2'}
      py={isCompact ? '0' : '0.5'}
      fontSize={isCompact ? 'xs' : undefined}
      lineHeight={isCompact ? '1.25rem' : undefined}
    >
      <Box boxSize={isCompact ? '1' : '1.5'} rounded="full" bg="currentColor" />
      {children ?? styles.label}
    </Badge>
  );
}

export function SettingsDropdown({
  ariaLabel,
  options,
  value,
  onValueChange,
}: {
  ariaLabel: string;
  options: Array<{ value: string; label: string }>;
  value: string;
  onValueChange: (value: string) => void;
}) {
  return (
    <RadioDropdownMenu
      ariaLabel={ariaLabel}
      buttonProps={{
        h: 'var(--arkivra-controlHeight, 2.5rem)',
        minW: '0',
        rounded: 'md',
        borderColor: 'border.surface',
        px: 'var(--arkivra-controlPaddingX, 0.75rem)',
      }}
      options={options}
      value={value}
      onValueChange={onValueChange}
    />
  );
}

export function InlineRecommendation({
  tone,
  title,
  description,
  action,
}: {
  tone: SettingsStatusTone;
  title: string;
  description: ReactNode;
  action?: ReactNode;
}) {
  return (
    <Flex
      direction={{ base: 'column', md: 'row' }}
      align={{ base: 'stretch', md: 'center' }}
      justify="space-between"
      gap="3"
      rounded="md"
      borderWidth="1px"
      borderColor="border.surface"
      bg="bg.subtle"
      px="3.5"
      py="var(--arkivra-rowPaddingY, 0.875rem)"
    >
      <HStack gap="3" align="flex-start">
        <Box pt="0.5">
          <SettingsStatusBadge tone={tone}>{statusToneStyles[tone].label}</SettingsStatusBadge>
        </Box>
        <Stack gap="0.5">
          <Text fontSize="sm" fontWeight="medium" color="fg">
            {title}
          </Text>
          <Text textStyle="sm" color="fg.muted">
            {description}
          </Text>
        </Stack>
      </HStack>
      {action ? <Box flexShrink={0}>{action}</Box> : null}
    </Flex>
  );
}

export function SectionDivider() {
  return <Separator borderColor="border.surface" />;
}
