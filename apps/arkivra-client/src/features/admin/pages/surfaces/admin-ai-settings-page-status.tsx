import type { ReactNode } from 'react';
import { Box, Flex, Grid, HStack, SimpleGrid, Stack, Text } from '@chakra-ui/react';
import { Database, Info, Languages, MessageSquare, Search, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import type { AdminEmbeddingIndexSummary } from '@/features/admin/admin.types';
import {
  AiSettingsSection,
  ChunkProgressBar,
  RequirementStatus,
  SemanticSearchMetric,
} from './admin-ai-settings-page-sections';
import type { ChunkProgressVisualStatus } from './admin-ai-settings-page-sections';
import { formatShortDateTime } from './admin-ai-settings-page-status-helpers';

interface ReadinessCheck {
  label: string;
  statusLabel: string;
  missingLabel: string;
  isMet: boolean;
}

export function AdminAiPlatformSection({
  accentColor,
  aiFeaturesEnabled,
  isAiReady,
  isSaving,
  readinessChecks,
  onToggleAiFeatures,
}: {
  accentColor: string;
  aiFeaturesEnabled: boolean;
  isAiReady: boolean;
  isSaving: boolean;
  readinessChecks: ReadinessCheck[];
  onToggleAiFeatures: (checked: boolean) => void;
}) {
  const completedCount = readinessChecks.filter((check) => check.isMet).length;
  const progress =
    readinessChecks.length > 0 ? Math.round((completedCount / readinessChecks.length) * 100) : 0;

  return (
    <AiSettingsSection
      title={
        <HStack gap="3" minW="0">
          <Flex
            boxSize="10"
            align="center"
            justify="center"
            rounded="md"
            bg="blue.subtle"
            color="blue.solid"
            flexShrink={0}
          >
            <Sparkles size={20} />
          </Flex>
          <Stack gap="1" minW="0">
            <HStack gap="2" minW="0" flexWrap="wrap">
              <Text fontSize="lg" fontWeight="semibold" color="fg" lineHeight="short">
                AI Platform
              </Text>
              <Badge colorPalette={aiFeaturesEnabled ? 'teal' : 'gray'} variant="subtle">
                {aiFeaturesEnabled ? 'Enabled' : 'Not enabled'}
              </Badge>
            </HStack>
            <Text textStyle="sm" color="fg.muted">
              Enable AI-powered capabilities in Arkivra.
            </Text>
          </Stack>
        </HStack>
      }
      actions={
        <HStack gap="3" align="center">
          <Switch
            aria-label="Enable AI Platform"
            checked={aiFeaturesEnabled}
            colorPalette={accentColor}
            disabled={(!aiFeaturesEnabled && !isAiReady) || isSaving}
            onCheckedChange={onToggleAiFeatures}
          />
          <Text textStyle="sm" fontWeight="medium" color="fg.muted">
            {aiFeaturesEnabled ? 'Enabled' : 'Disabled'}
          </Text>
        </HStack>
      }
    >
      <Grid
        templateColumns={{ base: '1fr', xl: 'minmax(0, 1.35fr) minmax(18rem, 0.95fr)' }}
        gap="5"
        alignItems="end"
      >
        <Stack gap="4" minW="0">
          <Stack gap="3">
            <HStack gap="2" flexWrap="wrap">
              <Text textStyle="sm" fontWeight="semibold" color="fg">
                Requirements
              </Text>
              <Badge colorPalette={isAiReady ? 'teal' : 'gray'} variant="subtle">
                {completedCount} / {readinessChecks.length} completed
              </Badge>
            </HStack>
            <ChunkProgressBar progress={progress} status={isAiReady ? 'active' : 'idle'} />
          </Stack>

          <Stack gap="1">
            {readinessChecks.map((check) => (
              <RequirementStatus
                key={check.label}
                label={check.label}
                statusLabel={check.statusLabel}
                missingLabel={check.missingLabel}
                isMet={check.isMet}
              />
            ))}
          </Stack>
        </Stack>

        <Box rounded="md" borderWidth="1px" borderColor="blue.muted" bg="blue.subtle" px="4" py="4">
          <Stack gap="2.5">
            <HStack gap="2" align="center">
              <Box color="fg.info" aria-hidden="true">
                <Info size={16} />
              </Box>
              <Text textStyle="sm" fontWeight="semibold" color="blue.solid">
                What is the AI Platform?
              </Text>
            </HStack>
            <Text textStyle="sm" color="fg.muted">
              The AI Platform powers Arkivra's AI capabilities. All requirements must be met before
              it can be enabled. Once enabled, you can turn on the capabilities you want to use.
            </Text>
          </Stack>
        </Box>
      </Grid>
    </AiSettingsSection>
  );
}

export function AdminAiCapabilitiesSection({
  accentColor,
  aiFeaturesEnabled,
  chatEnabled,
  isSaving,
  semanticEnabled,
  translationEnabled,
  onToggleChat,
  onToggleSemantic,
  onToggleTranslation,
}: {
  accentColor: string;
  aiFeaturesEnabled: boolean;
  chatEnabled: boolean;
  isSaving: boolean;
  semanticEnabled: boolean;
  translationEnabled: boolean;
  onToggleChat: (checked: boolean) => void;
  onToggleSemantic: (checked: boolean) => void;
  onToggleTranslation: (checked: boolean) => void;
}) {
  const isDisabled = !aiFeaturesEnabled || isSaving;

  return (
    <AiSettingsSection
      title="AI Capabilities"
      description="Choose which AI capabilities to make available in Arkivra."
    >
      <Grid templateColumns={{ base: '1fr', xl: '15rem minmax(0, 1fr)' }} gap="4">
        <Box display={{ base: 'none', xl: 'block' }} />
        <SimpleGrid columns={{ base: 1, md: 3 }} gap="3" alignItems="stretch">
          <CapabilityCard
            accentColor={accentColor}
            checked={semanticEnabled}
            description="Find documents by meaning, not keywords."
            disabled={isDisabled}
            icon={<Search size={22} />}
            iconBg="green.subtle"
            iconColor="green.solid"
            label="AI Search"
            requirement="Embedding model"
            onToggle={onToggleSemantic}
          />
          <CapabilityCard
            accentColor={accentColor}
            checked={chatEnabled}
            description="Ask questions and get answers from your documents."
            disabled={isDisabled}
            icon={<MessageSquare size={22} />}
            iconBg="blue.subtle"
            iconColor="blue.solid"
            label="AI Chat"
            requirement="Chat model"
            onToggle={onToggleChat}
          />
          <CapabilityCard
            accentColor={accentColor}
            checked={translationEnabled}
            description="Translate documents to multiple languages."
            disabled={isDisabled}
            icon={<Languages size={22} />}
            iconBg="purple.subtle"
            iconColor="purple.solid"
            label="Translation"
            requirement="Vision model"
            onToggle={onToggleTranslation}
          />
        </SimpleGrid>
      </Grid>

      <HStack gap="2" color="fg.muted">
        <Box color="fg.info" aria-hidden="true">
          <Info size={14} />
        </Box>
        <Text textStyle="xs">
          Capabilities can only be turned on after the AI Platform is enabled.
        </Text>
      </HStack>
    </AiSettingsSection>
  );
}

export function AdminAiSemanticSearchSection({
  chunkTotal,
  currentIndex,
  indexProgress,
  indexedChunks,
  liveIndexModel,
  semanticProgressStatus,
  semanticStatus,
}: {
  chunkTotal: number;
  currentIndex: AdminEmbeddingIndexSummary | null;
  indexProgress: number;
  indexedChunks: number;
  liveIndexModel: string;
  semanticProgressStatus: ChunkProgressVisualStatus;
  semanticStatus: string;
}) {
  const showProgress = semanticProgressStatus === 'building' || semanticProgressStatus === 'paused';

  return (
    <AiSettingsSection
      title="AI Search"
      description="Overview of your AI search index."
    >
      <Stack gap="3">
        <SimpleGrid
          columns={{ base: 1, md: 2, xl: 4 }}
          gap="0"
          rounded="md"
          borderWidth="1px"
          borderColor="border.surface"
          bg="bg.surface"
          overflow="hidden"
        >
          <SemanticSearchMetric icon={<Search size={16} />} label="Status" value={semanticStatus} />
          <SemanticSearchMetric
            icon={<Database size={16} />}
            label="Model"
            value={currentIndex?.model ?? liveIndexModel}
            helpText={
              currentIndex?.dimensions
                ? `${currentIndex.dimensions.toLocaleString()} dimensions`
                : undefined
            }
          />
          <SemanticSearchMetric
            icon={<Info size={16} />}
            label="Indexed chunks"
            value={indexedChunks.toLocaleString()}
            helpText={chunkTotal > 0 ? `${chunkTotal.toLocaleString()} total` : undefined}
          />
          <SemanticSearchMetric
            icon={<Info size={16} />}
            label="Last updated"
            value={formatShortDateTime(currentIndex?.updatedAt)}
          />
        </SimpleGrid>

        {showProgress ? (
          <Stack gap="2">
            <HStack justify="space-between" gap="3">
              <Text textStyle="xs" fontWeight="medium" color="fg.muted">
                {semanticProgressStatus === 'paused' ? 'Paused' : 'Indexing in progress'}
              </Text>
              <Text textStyle="xs" color="fg.muted">
                {indexProgress}%
              </Text>
            </HStack>
            <ChunkProgressBar progress={indexProgress} status={semanticProgressStatus} />
          </Stack>
        ) : null}
      </Stack>
    </AiSettingsSection>
  );
}

function CapabilityCard({
  accentColor,
  checked,
  description,
  disabled,
  icon,
  iconBg,
  iconColor,
  label,
  requirement,
  onToggle,
}: {
  accentColor: string;
  checked: boolean;
  description: string;
  disabled: boolean;
  icon: ReactNode;
  iconBg: string;
  iconColor: string;
  label: string;
  requirement: string;
  onToggle: (checked: boolean) => void;
}) {
  return (
    <Stack
      gap="3"
      rounded="md"
      borderWidth="1px"
      borderColor="border.surface"
      bg="bg.surface"
      p="4"
      minH="14rem"
      justify="space-between"
    >
      <Stack gap="3">
        <Flex
          boxSize="12"
          align="center"
          justify="center"
          rounded="md"
          bg={iconBg}
          color={iconColor}
          aria-hidden="true"
        >
          {icon}
        </Flex>
        <Stack gap="1">
          <Text textStyle="sm" fontWeight="semibold" color="fg">
            {label}
          </Text>
          <Text textStyle="sm" color="fg.muted">
            {description}
          </Text>
        </Stack>
        <Stack gap="1">
          <Text textStyle="xs" color="fg.muted">
            Requires
          </Text>
          <Badge alignSelf="flex-start" colorPalette="gray" variant="subtle">
            {requirement}
          </Badge>
        </Stack>
      </Stack>
      <HStack gap="2">
        <Switch
          aria-label={`Enable ${label}`}
          checked={checked}
          colorPalette={accentColor}
          disabled={disabled}
          onCheckedChange={onToggle}
        />
        <Text textStyle="sm" color="fg.muted">
          {checked ? 'On' : 'Off'}
        </Text>
      </HStack>
    </Stack>
  );
}
