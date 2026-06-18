import type { ReactNode } from 'react';
import { Box, Flex, Grid, HStack, Stack, Text } from '@chakra-ui/react';
import { CheckCircle2, ExternalLink, CircleX } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { AdminEmbeddingIndexSummary } from '@/features/admin/admin.types';

export function RequirementStatus({
  isMet,
  label,
  missingLabel,
  statusLabel,
}: {
  label: string;
  missingLabel: string;
  statusLabel: string;
  isMet: boolean;
}) {
  return (
    <HStack gap="3" align="center" minW="0" py="1.5">
      <Flex
        boxSize="5"
        align="center"
        justify="center"
        rounded="full"
        bg="transparent"
        color={isMet ? 'fg.success' : 'fg.error'}
        flexShrink={0}
      >
        {isMet ? <CheckCircle2 size={16} /> : <CircleX size={16} />}
      </Flex>
      <Flex align="center" justify="space-between" gap="3" minW="0" flex="1">
        <Text textStyle="sm" color="fg.muted" minW="0">
          {label}
        </Text>
        <Badge
          colorPalette={isMet ? 'teal' : 'red'}
          variant="subtle"
          flexShrink={0}
        >
          {isMet ? statusLabel : missingLabel}
        </Badge>
      </Flex>
    </HStack>
  );
}

export function AiSettingsSection({
  actionLabel,
  actionType = 'button',
  actions,
  children,
  description,
  minH,
  onAction,
  titleMeta,
  tone = 'default',
  title,
}: {
  title: ReactNode;
  description?: ReactNode;
  minH?: string;
  titleMeta?: ReactNode;
  actionLabel?: string;
  actionType?: 'button' | 'external';
  onAction?: () => void;
  actions?: ReactNode;
  children: ReactNode;
  tone?: 'default' | 'success' | 'warning';
}) {
  const toneStyles =
    tone === 'success'
      ? { borderColor: 'green.muted', bg: 'green.subtle' }
      : tone === 'warning'
        ? { borderColor: 'orange.muted', bg: 'orange.subtle' }
        : { borderColor: 'border.surface', bg: 'bg.surface' };

  return (
    <Card
      p="var(--arkivra-sectionPadding, 1rem)"
      shadow="xs"
      borderColor={toneStyles.borderColor}
      bg={toneStyles.bg}
      minH={minH}
    >
      <Stack gap="3">
        <Flex
          direction={{ base: 'column', md: 'row' }}
          align={{ base: 'stretch', md: 'flex-start' }}
          justify="space-between"
          gap="2"
        >
          <Stack gap="0.5" minW="0">
            <HStack gap="2" minW="0" align="center">
              {typeof title === 'string' ? (
                <Text fontSize="md" fontWeight="semibold" color="fg" lineHeight="short">
                  {title}
                </Text>
              ) : (
                <Box minW="0">{title}</Box>
              )}
              {titleMeta}
            </HStack>
            {description ? (
              <Text textStyle="sm" color="fg.muted" maxW="2xl">
                {description}
              </Text>
            ) : null}
          </Stack>
          {actions ? (
            <HStack flexShrink={0}>{actions}</HStack>
          ) : actionLabel ? (
            <Button type="button" variant="outline" size="sm" flexShrink={0} onClick={onAction}>
              {actionLabel}
              {actionType === 'external' ? <ExternalLink size={14} /> : null}
            </Button>
          ) : null}
        </Flex>
        {children}
      </Stack>
    </Card>
  );
}

export type ChunkProgressVisualStatus = AdminEmbeddingIndexSummary['status'] | 'paused' | 'idle';

export function ChunkProgressBar({
  progress,
  status,
  size = 'sm',
}: {
  progress: number;
  status?: ChunkProgressVisualStatus;
  size?: 'sm' | 'lg';
}) {
  const isBuilding = status === 'building';
  const isPaused = status === 'paused';
  const fillBg =
    status === 'failed'
      ? 'fg.error'
      : isPaused
        ? 'gray.400'
        : status === 'idle'
          ? 'fg.muted'
          : 'teal.solid';
  const stripedBg =
    status === 'failed'
      ? 'repeating-linear-gradient(45deg, var(--chakra-colors-red-solid), var(--chakra-colors-red-solid) 0.5rem, var(--chakra-colors-red-emphasized) 0.5rem, var(--chakra-colors-red-emphasized) 1rem)'
      : 'repeating-linear-gradient(45deg, var(--chakra-colors-teal-solid), var(--chakra-colors-teal-solid) 0.5rem, var(--chakra-colors-teal-emphasized) 0.5rem, var(--chakra-colors-teal-emphasized) 1rem)';

  return (
    <Box h={size === 'lg' ? '3' : '2'} rounded="full" bg="bg.subtle" overflow="hidden">
      <Box
        className="arkivra-index-progress-bar"
        h="full"
        bg={isBuilding || status === 'failed' ? stripedBg : fillBg}
        bgSize={isBuilding || status === 'failed' ? '2rem 2rem' : undefined}
        opacity={isPaused ? 0.72 : 1}
        animation={
          isBuilding
            ? 'arkivra-index-progress 1s linear infinite'
            : isPaused
              ? 'arkivra-index-paused 1.8s ease-in-out infinite'
              : undefined
        }
        transition="width 160ms ease"
        style={{ width: `${progress}%` }}
      />
    </Box>
  );
}

export function CompactMetric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <Stack gap="0.5" minW="0">
      <Text textStyle="xs" color="fg.muted">
        {label}
      </Text>
      <Box fontSize="sm" fontWeight="semibold" color="fg" minW="0">
        {value}
      </Box>
    </Stack>
  );
}

export function SemanticSearchMetric({
  helpText,
  icon,
  label,
  value,
}: {
  helpText?: ReactNode;
  icon: ReactNode;
  label: string;
  value: ReactNode;
}) {
  return (
    <HStack
      gap="3"
      align="center"
      px="4"
      py="3"
      minH="4.75rem"
      borderRightWidth={{ base: '0', md: '1px' }}
      borderBottomWidth={{ base: '1px', md: '0' }}
      borderColor="border.surface"
      _last={{ borderRightWidth: '0', borderBottomWidth: '0' }}
    >
      <Flex
        boxSize="9"
        align="center"
        justify="center"
        rounded="full"
        bg="bg.subtle"
        color="fg.muted"
        flexShrink={0}
        aria-hidden="true"
      >
        {icon}
      </Flex>
      <Stack gap="0.5" minW="0">
        <Text textStyle="xs" color="fg.muted">
          {label}
        </Text>
        <Text textStyle="sm" fontWeight="semibold" color="fg" truncate>
          {value}
        </Text>
        {helpText ? (
          <Text textStyle="xs" color="fg.muted" truncate>
            {helpText}
          </Text>
        ) : null}
      </Stack>
    </HStack>
  );
}

export function SemanticIndexProgressSummary({
  indexedChunks,
  expectedChunks,
  progress,
  status,
}: {
  indexedChunks: number;
  expectedChunks: number;
  progress: number;
  status?: ChunkProgressVisualStatus;
}) {
  return (
    <Stack gap="2.5">
      <Grid templateColumns="minmax(0, 1fr) auto minmax(5rem, 0.45fr)" alignItems="start" gap="3">
        <Stack gap="0.5" minW="0">
          <Text fontSize="md" fontWeight="semibold" color="fg" lineHeight="short">
            {indexedChunks.toLocaleString()}{' '}
            <Box as="span" color="fg.muted" fontWeight="medium">
              / {expectedChunks.toLocaleString()}
            </Box>
          </Text>
          <Text textStyle="xs" color="fg.muted">
            Chunks indexed
          </Text>
        </Stack>
        <Box w="1px" h="9" bg="border.surface" />
        <Stack gap="0.5" minW="0">
          <Text fontSize="md" fontWeight="semibold" color="fg" lineHeight="short">
            {progress}%
          </Text>
          <Text textStyle="xs" color="fg.muted">
            Complete
          </Text>
        </Stack>
      </Grid>
      <ChunkProgressBar progress={progress} status={status} />
    </Stack>
  );
}
