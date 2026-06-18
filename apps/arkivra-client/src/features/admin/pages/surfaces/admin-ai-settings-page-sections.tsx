import type { ReactNode } from 'react';
import { Box, Flex, Grid, HStack, Stack, Text } from '@chakra-ui/react';
import { AlertTriangle, CheckCircle2, CircleX, Clock3 } from 'lucide-react';
import { Card } from '@/components/ui/card';
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
    <HStack gap="2" align="flex-start" minW="0" px="3" py="2.5">
      <Flex
        boxSize="4"
        align="center"
        justify="center"
        rounded="full"
        bg="transparent"
        color={isMet ? 'fg.success' : 'fg.warning'}
        flexShrink={0}
        mt="0.5"
      >
        {isMet ? <CheckCircle2 size={14} /> : <CircleX size={14} />}
      </Flex>
      <Stack gap="0" minW="0">
        <Text textStyle="sm" fontWeight="medium" color={isMet ? 'fg' : 'fg.warning'}>
          {label}
        </Text>
        <Text textStyle="xs" color={isMet ? 'fg.muted' : 'fg.warning'}>
          {isMet ? statusLabel : missingLabel}
        </Text>
      </Stack>
    </HStack>
  );
}

export function AiSettingsSection({
  actions,
  children,
  description,
  minH,
  titleMeta,
  tone = 'default',
  title,
}: {
  title: ReactNode;
  description?: ReactNode;
  minH?: string;
  titleMeta?: ReactNode;
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
              <Text fontSize="md" fontWeight="semibold" color="fg" lineHeight="short">
                {title}
              </Text>
              {titleMeta}
            </HStack>
            {description ? (
              <Text textStyle="sm" color="fg.muted" maxW="2xl">
                {description}
              </Text>
            ) : null}
          </Stack>
          {actions ? <HStack flexShrink={0}>{actions}</HStack> : null}
        </Flex>
        {children}
      </Stack>
    </Card>
  );
}

export function CapabilityStatus({
  label,
  status,
  tone,
}: {
  label: string;
  status: string;
  tone: 'ready' | 'warning' | 'disabled';
}) {
  const color = tone === 'ready' ? 'fg.success' : tone === 'warning' ? 'fg.warning' : 'fg.muted';

  return (
    <Flex align="center" justify="space-between" gap="3" py="1.5">
      <HStack gap="2">
        <Box color={color} aria-hidden="true">
          {tone === 'ready' ? (
            <CheckCircle2 size={16} />
          ) : tone === 'warning' ? (
            <AlertTriangle size={16} />
          ) : (
            <Clock3 size={16} />
          )}
        </Box>
        <Text textStyle="sm" fontWeight="medium" color="fg">
          {label}
        </Text>
      </HStack>
      <Text textStyle="sm" color="fg.muted">
        {status}
      </Text>
    </Flex>
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
