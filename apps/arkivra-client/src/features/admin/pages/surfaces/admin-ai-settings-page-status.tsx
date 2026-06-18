import { Box, Grid, HStack, SimpleGrid, Stack, Text } from '@chakra-ui/react';
import { Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import type { AdminEmbeddingIndexSummary } from '@/features/admin/admin.types';
import { SettingsStatusBadge } from '@/features/settings/components/settings-ui';
import type { SettingsStatusTone } from '@/features/settings/components/settings-ui';
import {
  AiSettingsSection,
  CapabilityStatus,
  CompactMetric,
  RequirementStatus,
  SemanticIndexProgressSummary,
} from './admin-ai-settings-page-sections';
import type { ChunkProgressVisualStatus } from './admin-ai-settings-page-sections';
import { formatShortDateTime } from './admin-ai-settings-page-status-helpers';

interface ReadinessCheck {
  label: string;
  statusLabel: string;
  missingLabel: string;
  isMet: boolean;
}

export function AdminAiReadinessSection({
  isAiReady,
  readinessChecks,
}: {
  isAiReady: boolean;
  readinessChecks: ReadinessCheck[];
}) {
  return (
    <AiSettingsSection
      title="AI Readiness"
      description="Requirements that must be in place before AI can be enabled."
      tone={isAiReady ? 'success' : 'warning'}
    >
      <Grid
        templateColumns={{ base: '1fr', xl: 'minmax(0, 1fr) minmax(13rem, 0.32fr)' }}
        gap="4"
        alignItems="stretch"
      >
        <SimpleGrid
          columns={{ base: 1, md: 2, xl: 5 }}
          gap="0"
          rounded="md"
          borderWidth="1px"
          borderColor="border.surface"
          bg="bg.surface"
          overflow="hidden"
        >
          {readinessChecks.map((check, index) => (
            <Box
              key={check.label}
              borderRightWidth={{
                base: '0',
                md: index % 2 === 0 && index !== readinessChecks.length - 1 ? '1px' : '0',
                xl: index === readinessChecks.length - 1 ? '0' : '1px',
              }}
              borderBottomWidth={{
                base: index === readinessChecks.length - 1 ? '0' : '1px',
                md: index === readinessChecks.length - 1 ? '0' : '1px',
                xl: '0',
              }}
              borderColor="border.surface"
            >
              <RequirementStatus
                label={check.label}
                statusLabel={check.statusLabel}
                missingLabel={check.missingLabel}
                isMet={check.isMet}
              />
            </Box>
          ))}
        </SimpleGrid>
        <Box
          borderLeftWidth={{ base: '0', xl: '1px' }}
          borderTopWidth={{ base: '1px', xl: '0' }}
          borderColor="border.surface"
          ps={{ base: '0', xl: '4' }}
          pt={{ base: '3', xl: '0' }}
        >
          <Stack gap="1">
            <Text
              textStyle="sm"
              fontWeight="semibold"
              color={isAiReady ? 'fg.success' : 'fg.warning'}
            >
              {isAiReady ? 'All set!' : 'Configuration required'}
            </Text>
            <Text textStyle="sm" color="fg.muted">
              {isAiReady
                ? 'You can enable AI features.'
                : 'Configure the missing requirements before enabling AI.'}
            </Text>
          </Stack>
        </Box>
      </Grid>
    </AiSettingsSection>
  );
}

export function AdminAiFeatureStatusSection({
  accentColor,
  aiFeaturesEnabled,
  chatStatus,
  isAiReady,
  isChatConfigValid,
  isEmbeddingConfigValid,
  isSaving,
  isTranslationConfigValid,
  platformStatus,
  platformTone,
  semanticStatus,
  translationStatus,
  onToggleAiFeatures,
}: {
  accentColor: string;
  aiFeaturesEnabled: boolean;
  chatStatus: string;
  isAiReady: boolean;
  isChatConfigValid: boolean;
  isEmbeddingConfigValid: boolean;
  isSaving: boolean;
  isTranslationConfigValid: boolean;
  platformStatus: string;
  platformTone: SettingsStatusTone;
  semanticStatus: string;
  translationStatus: string;
  onToggleAiFeatures: (checked: boolean) => void;
}) {
  return (
    <AiSettingsSection
      title="AI features"
      description="Enable or disable AI capabilities across Arkivra."
      actions={<SettingsStatusBadge tone={platformTone}>{platformStatus}</SettingsStatusBadge>}
    >
      <Grid
        templateColumns={{ base: '1fr', lg: 'minmax(18rem, 1fr) minmax(16rem, 0.95fr)' }}
        gap="4"
      >
        <Stack gap="4" minW="0">
          <Stack gap="2.5">
            <Text textStyle="sm" fontWeight="semibold" color="fg">
              AI features
            </Text>
            <HStack gap="3">
              <Switch
                aria-label="Enable AI features"
                checked={aiFeaturesEnabled}
                colorPalette={accentColor}
                disabled={(!aiFeaturesEnabled && !isAiReady) || isSaving}
                onCheckedChange={onToggleAiFeatures}
              />
              <Text textStyle="sm" fontWeight="semibold" color="fg">
                {aiFeaturesEnabled ? 'Enabled' : 'Disabled'}
              </Text>
            </HStack>
          </Stack>
          <Text textStyle="sm" color="fg.muted">
            When enabled, semantic search indexing and AI chat capabilities will be available.
          </Text>
        </Stack>

        <Stack
          gap="3"
          minW="0"
          borderLeftWidth={{ base: '0', lg: '1px' }}
          borderColor="border.surface"
          pl={{ base: '0', lg: '5' }}
        >
          <Text textStyle="sm" fontWeight="semibold" color="fg">
            Feature status
          </Text>
          <Stack gap="1">
            <CapabilityStatus
              label="Semantic Search"
              status={semanticStatus}
              tone={
                aiFeaturesEnabled && isEmbeddingConfigValid
                  ? 'ready'
                  : aiFeaturesEnabled
                    ? 'warning'
                    : 'disabled'
              }
            />
            <CapabilityStatus
              label="AI Chat"
              status={aiFeaturesEnabled ? chatStatus : 'Paused'}
              tone={
                aiFeaturesEnabled && isChatConfigValid
                  ? 'ready'
                  : aiFeaturesEnabled
                    ? 'warning'
                    : 'disabled'
              }
            />
            <CapabilityStatus
              label="Translation"
              status={aiFeaturesEnabled ? translationStatus : 'Paused'}
              tone={
                aiFeaturesEnabled && isTranslationConfigValid
                  ? 'ready'
                  : aiFeaturesEnabled
                    ? 'warning'
                    : 'disabled'
              }
            />
          </Stack>
        </Stack>
      </Grid>
    </AiSettingsSection>
  );
}

export function AdminAiSemanticSearchSection({
  chunkTotal,
  currentIndex,
  indexProgress,
  indexedChunks,
  liveIndexModel,
  semanticIndexTone,
  semanticProgressStatus,
  semanticStatus,
  semanticStatusMessage,
  showDetails,
  onToggleDetails,
}: {
  chunkTotal: number;
  currentIndex: AdminEmbeddingIndexSummary | null;
  indexProgress: number;
  indexedChunks: number;
  liveIndexModel: string;
  semanticIndexTone: SettingsStatusTone;
  semanticProgressStatus: ChunkProgressVisualStatus;
  semanticStatus: string;
  semanticStatusMessage: string;
  showDetails: boolean;
  onToggleDetails: () => void;
}) {
  return (
    <AiSettingsSection
      title="Semantic Search"
      description="The index enables semantic search across your documents."
      actions={
        <>
          <SettingsStatusBadge tone={semanticIndexTone}>{semanticStatus}</SettingsStatusBadge>
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label={showDetails ? 'Hide semantic search details' : 'View semantic search details'}
            onClick={onToggleDetails}
          >
            {showDetails ? 'Hide details' : 'View details'}
          </Button>
        </>
      }
    >
      <Stack gap="4">
        <Grid
          templateColumns={{ base: '1fr', lg: 'minmax(0, 1.35fr) minmax(18rem, 0.9fr)' }}
          gap="4"
          alignItems="stretch"
        >
          <Stack gap="3">
            <SemanticIndexProgressSummary
              indexedChunks={indexedChunks}
              expectedChunks={chunkTotal}
              progress={indexProgress}
              status={semanticProgressStatus}
            />
            <SimpleGrid columns={{ base: 1, md: 3 }} gap="3">
              <CompactMetric
                label="Live index model"
                value={currentIndex?.model ?? liveIndexModel}
              />
              <CompactMetric label="Index version" value={currentIndex?.id ?? 'No index'} />
              <CompactMetric
                label="Last updated"
                value={formatShortDateTime(currentIndex?.updatedAt)}
              />
            </SimpleGrid>
            {showDetails ? (
              <SimpleGrid columns={{ base: 1, md: 2 }} gap="3">
                <CompactMetric
                  label="Started time"
                  value={formatShortDateTime(currentIndex?.buildStartedAt ?? currentIndex?.createdAt)}
                />
                <CompactMetric label="Expected chunks" value={chunkTotal.toLocaleString()} />
              </SimpleGrid>
            ) : null}
          </Stack>

          <Box
            rounded="md"
            borderWidth="1px"
            borderColor="blue.muted"
            bg="blue.subtle"
            px="4"
            py="4"
          >
            <Stack gap="2">
              <HStack gap="2" align="flex-start">
                <Box color="fg.info" mt="0.5" flexShrink={0}>
                  <Info size={15} />
                </Box>
                <Text textStyle="sm" fontWeight="semibold" color="blue.solid">
                  Current status: {semanticStatus}
                </Text>
              </HStack>
              <Text textStyle="sm" color="fg.muted">
                {semanticStatusMessage}
              </Text>
            </Stack>
          </Box>
        </Grid>
      </Stack>
    </AiSettingsSection>
  );
}
