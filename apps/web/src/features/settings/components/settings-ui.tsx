import type { ReactNode } from 'react';
import { Box, Flex, Grid, HStack, Heading, Menu, Portal, Stack, Text } from '@chakra-ui/react';
import { Check, ChevronDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
  title,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Stack as="section" gap="5" maxW="6xl" pb="8" pt="5">
      {title ? (
        <Flex
          as="header"
          direction={{ base: 'column', lg: 'row' }}
          align={{ base: 'stretch', lg: 'flex-end' }}
          justify="space-between"
          gap="3"
        >
          <Stack gap="1.5">
            <Heading as="h1" textStyle="2xl" fontWeight="semibold" lineHeight="short">
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

      <Stack gap="4">{children}</Stack>
    </Stack>
  );
}

export function SettingsSection({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Box rounded="lg" borderWidth="1px" borderColor="border.subtle" bg="bg.surface" p="var(--arkivra-sectionPadding, 1.25rem)" shadow="xs">
      <Stack gap="4">
        <Flex
          direction={{ base: 'column', md: 'row' }}
          align={{ base: 'stretch', md: 'flex-start' }}
          justify="space-between"
          gap="3"
        >
          <Stack gap="1">
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

export function SettingsRows({ children }: { children: ReactNode }) {
  return (
    <Stack gap="0" divideY="1px" divideColor="border.subtle">
      {children}
    </Stack>
  );
}

export function SettingsRow({
  label,
  description,
  meta,
  control,
}: {
  label: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
  control?: ReactNode;
}) {
  return (
    <Grid
      gap={{ base: '3', lg: '5' }}
      py="var(--arkivra-rowPaddingY, 0.875rem)"
      templateColumns={{ base: '1fr', lg: control ? 'minmax(0, 1fr) minmax(13rem, 17rem)' : '1fr' }}
      alignItems="center"
    >
      <Stack gap="1" minW="0">
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
  rows,
}: {
  rows: Array<{ label: string; value: ReactNode }>;
}) {
  return (
    <Stack gap="0" divideY="1px" divideColor="border.subtle">
      {rows.map((row) => (
        <Flex key={row.label} align="center" justify="space-between" gap="4" py="var(--arkivra-rowPaddingY, 0.875rem)">
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
  tone,
  children,
}: {
  tone: SettingsStatusTone;
  children?: ReactNode;
}) {
  const styles = statusToneStyles[tone];

  return (
    <Badge
      variant="secondary"
      bg={styles.bg}
      color={styles.color}
      display="inline-flex"
      alignItems="center"
      gap="1.5"
      rounded="full"
      px="2"
      py="0.5"
    >
      <Box boxSize="1.5" rounded="full" bg="currentColor" />
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
  const selectedLabel = options.find((option) => option.value === value)?.label ?? options[0]?.label ?? 'Select';

  return (
    <Menu.Root lazyMount unmountOnExit positioning={{ placement: 'bottom-end', gutter: 6, sameWidth: true }}>
      <Menu.Trigger asChild>
        <Button
          type="button"
          aria-label={ariaLabel}
          variant="outline"
          h="var(--arkivra-controlHeight, 2.5rem)"
          w="full"
          minW="0"
          justifyContent="space-between"
          gap="2"
          rounded="md"
          borderColor="border.subtle"
          bg="bg.surface"
          px="var(--arkivra-controlPaddingX, 0.75rem)"
          shadow="none"
          _hover={{ borderColor: 'fg/30', bg: 'bg.surface' }}
          _focusVisible={{
            borderColor: 'teal.solid',
            outline: '2px solid',
            outlineColor: 'teal.focusRing',
            outlineOffset: '1px',
          }}
        >
          <Text as="span" truncate fontSize="sm" fontWeight="medium">
            {selectedLabel}
          </Text>
          <Box flexShrink={0} color="fg.muted" aria-hidden="true">
            <ChevronDown size={16} />
          </Box>
        </Button>
      </Menu.Trigger>
      <Portal>
        <Menu.Positioner zIndex="dropdown">
          <Menu.Content
            rounded="lg"
            borderWidth="1px"
            borderColor="border.subtle"
            bg="bg.surface"
            p="1.5"
            shadow="lg"
          >
            <Menu.RadioItemGroup
              value={value}
              onValueChange={(event) => {
                if (event.value) {
                  onValueChange(event.value);
                }
              }}
            >
              {options.map((option) => (
                <Menu.RadioItem
                  key={option.value}
                  value={option.value}
                  position="relative"
                  minH="var(--arkivra-menuItemMinHeight, 2.5rem)"
                  rounded="md"
                  py="var(--arkivra-menuItemPaddingY, 0.5rem)"
                  ps="10"
                  pe="3"
                  fontSize="sm"
                  fontWeight="medium"
                  color="fg"
                  _checked={{ bg: 'teal.subtle', color: 'fg' }}
                  _highlighted={{ bg: value === option.value ? 'teal.subtle' : 'bg.subtle' }}
                >
                  <Box
                    position="absolute"
                    left="2.5"
                    top="50%"
                    display="flex"
                    boxSize="5"
                    alignItems="center"
                    justifyContent="center"
                    rounded="sm"
                    color="teal.solid"
                    transform="translateY(-50%)"
                  >
                    <Menu.ItemIndicator>
                      <Check size={16} strokeWidth={2.5} />
                    </Menu.ItemIndicator>
                  </Box>
                  <Menu.ItemText>{option.label}</Menu.ItemText>
                </Menu.RadioItem>
              ))}
            </Menu.RadioItemGroup>
          </Menu.Content>
        </Menu.Positioner>
      </Portal>
    </Menu.Root>
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
      borderColor="border.subtle"
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
  return <Separator borderColor="border.subtle" />;
}
