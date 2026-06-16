import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { Box, Flex, Grid, HStack, SimpleGrid, Stack, Text } from '@chakra-ui/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, CircleX, Clock3, Info, Languages, Package, Plus, Send } from 'lucide-react';
import { useAccentColor } from '@/components/providers/accent-color-context';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/components/ui/toaster-store';
import { updateAdminAiSettings } from '@/features/admin/admin.api';
import { adminQueryKeys, useAdminAiAvailabilityQuery, useAdminAiSettingsQuery, useAdminAiStatusQuery, useAdminOllamaModelsQuery } from '@/features/admin/admin.queries';
import type { AdminAiProviderSettings, AdminAiSettings, AdminEmbeddingIndexSummary } from '@/features/admin/admin.types';
import { formatDate } from '@/features/documents/documents.utils';
import { meQueryKeys, useMeQuery } from '@/features/me/me.queries';
import type { MeResponse } from '@/features/me/me.types';
import { SettingsRow, SettingsRows, SettingsStatusBadge } from '@/features/settings/components/settings-ui';
import type { SettingsStatusTone } from '@/features/settings/components/settings-ui';
import { AdminAccessBoundary } from './admin-shared';

const emptyAiSettings: AdminAiSettings = {
  aiFeaturesEnabled: false,
  chat: {
    provider: 'ollama',
    baseUrl: '',
    apiKeySecretRef: null,
    model: '',
    allowedModels: [],
  },
  translation: {
    provider: 'ollama',
    baseUrl: '',
    apiKeySecretRef: null,
    model: '',
  },
  embedding: {
    provider: 'ollama',
    baseUrl: '',
    apiKeySecretRef: null,
    model: 'bge-m3',
    dimensions: 1024,
  },
  providers: {
    gemini: {
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
      apiKeySecretRef: null,
    },
  },
  ollamaHost: '',
  model: '',
};

function formatIndexStatus(status: AdminEmbeddingIndexSummary['status']) {
  if (status === 'active' || status === 'ready') return 'Ready';
  if (status === 'building') return 'Building';
  if (status === 'failed') return 'Error';
  if (status === 'retiring' || status === 'retired') return 'Retired';
  return 'Unknown';
}

function getIndexProgress(index: AdminEmbeddingIndexSummary) {
  if (index.expectedChunkCount <= 0) {
    return index.status === 'active' || index.status === 'ready' ? 100 : 0;
  }

  return Math.min(100, Math.round((index.embeddedChunkCount / index.expectedChunkCount) * 100));
}

function formatProvider(provider: string) {
  if (provider === 'ollama') return 'Ollama';
  if (provider === 'gemini') return 'Google Gemini';
  return provider;
}

function getConnectionStatusLabel({
  enabled,
  isLoading,
  reachable,
  modelAvailable,
}: {
  enabled: boolean;
  isLoading: boolean;
  reachable?: boolean;
  modelAvailable?: boolean;
}) {
  if (!enabled) return 'Not Configured';
  if (isLoading) return 'Checking';
  return reachable && modelAvailable ? 'Healthy' : 'Error';
}

type AiSettingsDraftOverride = Partial<Omit<AdminAiSettings, 'chat' | 'translation' | 'embedding'>> & {
  chat?: Partial<AdminAiSettings['chat']>;
  translation?: Partial<AdminAiProviderSettings>;
  embedding?: Partial<AdminAiSettings['embedding']>;
};

interface EmbeddingModelOption {
  key: string;
  provider: AdminAiSettings['embedding']['provider'];
  providerLabel: string;
  baseUrl: string;
  model: string;
  dimensions: number;
  isActive: boolean;
  isConfigured: boolean;
  isDiscovered: boolean;
  size: number | null;
  modifiedAt: string | null;
}

interface EmbeddingModelCatalogEntry {
  provider: AdminAiSettings['embedding']['provider'];
  model: string;
}

const geminiBaseUrl = 'https://generativelanguage.googleapis.com/v1beta/openai';
const curatedGeminiChatModels = [
  'gemini-3.5-flash',
  'gemini-3.1-pro-preview',
  'gemini-3-flash-preview',
  'gemini-3.1-flash-lite',
  'gemini-2.5-pro',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
];

const popularEmbeddingModelCatalog: EmbeddingModelCatalogEntry[] = [
  { provider: 'ollama', model: 'bge-m3' },
  { provider: 'ollama', model: 'embeddinggemma' },
  { provider: 'ollama', model: 'nomic-embed-text' },
  { provider: 'ollama', model: 'mxbai-embed-large' },
  { provider: 'ollama', model: 'all-minilm' },
  { provider: 'ollama', model: 'snowflake-arctic-embed' },
  { provider: 'ollama', model: 'granite-embedding' },
  { provider: 'ollama', model: 'qwen3-embedding:0.6b' },
  { provider: 'ollama', model: 'qwen3-embedding:4b' },
  { provider: 'ollama', model: 'qwen3-embedding:8b' },
];

const latestModelTagPattern = /:latest$/;

function normalizeModelCatalogName(model: string) {
  return model.trim().toLowerCase().replace(latestModelTagPattern, '');
}

function getModelNameBase(model: string) {
  return normalizeModelCatalogName(model).split(':')[0] ?? '';
}

function matchesCatalogModel(discoveredModel: string, catalogModel: string) {
  const normalizedCatalogModel = normalizeModelCatalogName(catalogModel);

  if (normalizedCatalogModel.includes(':')) {
    return normalizeModelCatalogName(discoveredModel) === normalizedCatalogModel;
  }

  return getModelNameBase(discoveredModel) === normalizedCatalogModel;
}

function isCatalogEmbeddingModel(provider: AdminAiSettings['embedding']['provider'], model: string) {
  return popularEmbeddingModelCatalog.some(entry =>
    entry.provider === provider && matchesCatalogModel(model, entry.model),
  );
}

function formatShortDateTime(value: string | null | undefined) {
  if (!value) return 'Unavailable';
  return formatDate(value);
}

function RequirementStatus({
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
        <Text textStyle="sm" fontWeight="medium" color={isMet ? 'fg' : 'fg.warning'}>{label}</Text>
        <Text textStyle="xs" color={isMet ? 'fg.muted' : 'fg.warning'}>{isMet ? statusLabel : missingLabel}</Text>
      </Stack>
    </HStack>
  );
}

function AiSettingsSection({
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
  const toneStyles = tone === 'success'
    ? { borderColor: 'green.muted', bg: 'green.subtle' }
    : tone === 'warning'
      ? { borderColor: 'orange.muted', bg: 'orange.subtle' }
      : { borderColor: 'border.surface', bg: 'bg.surface' };

  return (
    <Card p="var(--arkivra-sectionPadding, 1rem)" shadow="xs" borderColor={toneStyles.borderColor} bg={toneStyles.bg} minH={minH}>
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

function CapabilityStatus({
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
          {tone === 'ready' ? <CheckCircle2 size={16} /> : tone === 'warning' ? <AlertTriangle size={16} /> : <Clock3 size={16} />}
        </Box>
        <Text textStyle="sm" fontWeight="medium" color="fg">{label}</Text>
      </HStack>
      <Text textStyle="sm" color="fg.muted">{status}</Text>
    </Flex>
  );
}

type ChunkProgressVisualStatus = AdminEmbeddingIndexSummary['status'] | 'paused' | 'idle';

function ChunkProgressBar({ progress, status, size = 'sm' }: { progress: number; status?: ChunkProgressVisualStatus; size?: 'sm' | 'lg' }) {
  const isBuilding = status === 'building';
  const isPaused = status === 'paused';
  const fillBg = status === 'failed'
    ? 'fg.error'
    : isPaused
      ? 'gray.400'
      : status === 'idle'
        ? 'fg.muted'
        : 'teal.solid';
  const stripedBg = status === 'failed'
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
        animation={isBuilding
          ? 'arkivra-index-progress 1s linear infinite'
          : isPaused
            ? 'arkivra-index-paused 1.8s ease-in-out infinite'
            : undefined}
        transition="width 160ms ease"
        style={{ width: `${progress}%` }}
      />
    </Box>
  );
}

function CompactMetric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <Stack gap="0.5" minW="0">
      <Text textStyle="xs" color="fg.muted">{label}</Text>
      <Box fontSize="sm" fontWeight="semibold" color="fg" minW="0">{value}</Box>
    </Stack>
  );
}

function SemanticIndexProgressSummary({
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
            {indexedChunks.toLocaleString()}
            {' '}
            <Box as="span" color="fg.muted" fontWeight="medium">
              /
              {' '}
              {expectedChunks.toLocaleString()}
            </Box>
          </Text>
          <Text textStyle="xs" color="fg.muted">Chunks indexed</Text>
        </Stack>
        <Box w="1px" h="9" bg="border.surface" />
        <Stack gap="0.5" minW="0">
          <Text fontSize="md" fontWeight="semibold" color="fg" lineHeight="short">{progress}%</Text>
          <Text textStyle="xs" color="fg.muted">Complete</Text>
        </Stack>
      </Grid>
      <ChunkProgressBar progress={progress} status={status} />
    </Stack>
  );
}

export function AdminAiSettingsPage() {
  const queryClient = useQueryClient();
  const { accentColor } = useAccentColor();
  const meQuery = useMeQuery();
  const isEnabled = meQuery.data?.isAdmin === true;
  const aiSettingsQuery = useAdminAiSettingsQuery({ enabled: isEnabled });
  const aiStatusQuery = useAdminAiStatusQuery({ enabled: isEnabled });
  const [aiDraftOverride, setAiDraftOverride] = useState<AiSettingsDraftOverride>({});
  const [expandedProvider, setExpandedProvider] = useState<'ollama' | 'gemini' | null>(null);
  const [isChatModelsDialogOpen, setIsChatModelsDialogOpen] = useState(false);
  const [draftAllowedChatModels, setDraftAllowedChatModels] = useState<string[]>([]);
  const [draftDefaultChatModel, setDraftDefaultChatModel] = useState('');
  const [isEmbeddingModelDialogOpen, setIsEmbeddingModelDialogOpen] = useState(false);
  const [selectedEmbeddingModelKey, setSelectedEmbeddingModelKey] = useState('');
  const [showSemanticIndexDetails, setShowSemanticIndexDetails] = useState(false);
  const savedAiSettings = aiSettingsQuery.data?.settings ?? emptyAiSettings;
  const aiDraft: AdminAiSettings = {
    ...savedAiSettings,
    ...aiDraftOverride,
    chat: {
      ...savedAiSettings.chat,
      ...(aiDraftOverride.chat ?? {}),
    },
    translation: {
      ...(savedAiSettings.translation ?? savedAiSettings.chat),
      ...(aiDraftOverride.translation ?? {}),
    },
    embedding: {
      ...savedAiSettings.embedding,
      ...(aiDraftOverride.embedding ?? {}),
    },
    providers: {
      ...(savedAiSettings.providers ?? emptyAiSettings.providers),
      ...(aiDraftOverride.providers ?? {}),
      gemini: {
        baseUrl: geminiBaseUrl,
        apiKeySecretRef: null,
        ...(savedAiSettings.providers?.gemini ?? emptyAiSettings.providers?.gemini),
        ...(aiDraftOverride.providers?.gemini ?? {}),
      },
    },
  };
  aiDraft.ollamaHost = aiDraft.chat.provider === 'ollama'
    ? aiDraft.chat.baseUrl
    : savedAiSettings.ollamaHost || aiDraft.translation.baseUrl || aiDraft.embedding.baseUrl;
  aiDraft.model = aiDraft.chat.provider === 'ollama'
    ? aiDraft.chat.model
    : savedAiSettings.model || aiDraft.translation.model;
  aiDraft.translation.baseUrl = aiDraft.translation.baseUrl || aiDraft.ollamaHost || aiDraft.embedding.baseUrl;
  const effectiveOllamaBaseUrl = aiDraft.chat.provider === 'ollama'
    ? aiDraft.chat.baseUrl
    : aiDraft.ollamaHost || aiDraft.translation.baseUrl || aiDraft.embedding.baseUrl;
  const aiStatus = aiStatusQuery.data?.status;
  const activeIndex = aiStatus?.embedding.activeIndex ?? null;
  const preparingIndex = aiStatus?.embedding.candidateIndexes.find(index => index.status === 'building' || index.status === 'ready') ?? null;
  const currentIndex = preparingIndex ?? activeIndex;
  const chunkCoverage = aiStatus?.embedding.chunkCoverage ?? {
    indexedChunkCount: 0,
    totalChunkCount: 0,
  };
  const canListChatModels = isEnabled && aiDraft.chat.baseUrl.trim().length > 0;
  const chatModelsQuery = useAdminOllamaModelsQuery({
    host: aiDraft.chat.baseUrl,
    provider: aiDraft.chat.provider,
    enabled: canListChatModels,
  });
  const canListOllamaModels = isEnabled && aiDraft.embedding.baseUrl.trim().length > 0;
  const ollamaModelsQuery = useAdminOllamaModelsQuery({
    host: aiDraft.embedding.baseUrl,
    provider: 'ollama',
    enabled: canListOllamaModels,
  });
  const availableChatModelNames = useMemo(
    () => chatModelsQuery.data?.models.map(model => model.name) ?? [],
    [chatModelsQuery.data?.models],
  );
  const availableOllamaModelNames = useMemo(
    () => ollamaModelsQuery.data?.models.map(model => model.name) ?? [],
    [ollamaModelsQuery.data?.models],
  );
  const chatModelOptions = useMemo(() => {
    return availableChatModelNames.filter(model =>
      !isCatalogEmbeddingModel(aiDraft.chat.provider, model),
    );
  }, [aiDraft.chat.model, aiDraft.chat.provider, availableChatModelNames]);
  const translationModelOptions = useMemo(() => {
    return availableOllamaModelNames.filter(model =>
      !isCatalogEmbeddingModel(aiDraft.translation.provider, model),
    );
  }, [aiDraft.translation.model, aiDraft.translation.provider, availableOllamaModelNames]);
  const configuredChatModel = aiDraft.chat.model.trim();
  const isConfiguredChatModelAvailable = configuredChatModel.length > 0
    && chatModelOptions.includes(configuredChatModel);
  const effectiveDefaultChatModel = isConfiguredChatModelAvailable
    ? configuredChatModel
    : chatModelOptions[0] ?? '';
  const configuredTranslationModel = aiDraft.translation.model.trim() || savedAiSettings.translation?.model?.trim() || '';
  const isConfiguredTranslationModelAvailable = configuredTranslationModel.length > 0
    && translationModelOptions.includes(configuredTranslationModel);
  const effectiveTranslationModel =
    isConfiguredTranslationModelAvailable
      ? configuredTranslationModel
      : translationModelOptions[0] ?? '';
  const savedAllowedChatModels = aiDraft.chat.allowedModels ?? [];
  const effectiveAllowedChatModels = savedAllowedChatModels.length === 0
    ? chatModelOptions
    : chatModelOptions.filter(model => savedAllowedChatModels.includes(model) || model === effectiveDefaultChatModel);
  const chatAvailabilityQuery = useAdminAiAvailabilityQuery({
    host: aiDraft.chat.baseUrl,
    model: effectiveDefaultChatModel,
    provider: aiDraft.chat.provider,
    apiKeySecretRef: aiDraft.chat.apiKeySecretRef,
    enabled: canListChatModels && effectiveDefaultChatModel.length > 0,
  });
  const chatAvailability = chatAvailabilityQuery.data?.availability;
  const geminiAvailabilityQuery = useAdminAiAvailabilityQuery({
    host: geminiBaseUrl,
    model: curatedGeminiChatModels[0],
    provider: 'gemini',
    enabled: isEnabled,
  });
  const geminiAvailability = geminiAvailabilityQuery.data?.availability;
  const translationAvailabilityQuery = useAdminAiAvailabilityQuery({
    host: aiDraft.translation.baseUrl || aiDraft.ollamaHost || aiDraft.embedding.baseUrl,
    model: effectiveTranslationModel,
    provider: 'ollama',
    enabled: isEnabled && (aiDraft.translation.baseUrl || aiDraft.ollamaHost).trim().length > 0 && effectiveTranslationModel.length > 0,
  });
  const translationAvailability = translationAvailabilityQuery.data?.availability;
  const chatConnectionStatus = getConnectionStatusLabel({
    enabled: aiDraft.chat.baseUrl.trim().length > 0 && effectiveDefaultChatModel.length > 0,
    isLoading: chatAvailabilityQuery.isFetching,
    reachable: chatAvailability?.reachable,
    modelAvailable: chatAvailability?.modelAvailable,
  });
  const translationConnectionStatus = getConnectionStatusLabel({
    enabled: (aiDraft.translation.baseUrl || aiDraft.chat.baseUrl).trim().length > 0 && effectiveTranslationModel.length > 0,
    isLoading: translationAvailabilityQuery.isFetching,
    reachable: translationAvailability?.reachable,
    modelAvailable: translationAvailability?.modelAvailable,
  });
  const isChatConfigValid =
    aiDraft.chat.baseUrl.trim().length > 0
    && effectiveDefaultChatModel.length > 0;
  const ollamaProviderStatus = effectiveOllamaBaseUrl.trim().length === 0
    ? 'Not Configured'
    : ollamaModelsQuery.isFetching ? 'Checking'
      : ollamaModelsQuery.isError ? 'Error'
        : (ollamaModelsQuery.data?.models.length ?? 0) > 0 ? 'Healthy' : 'No models';
  const ollamaProviderTone = ollamaProviderStatus === 'Healthy' ? 'enabled' : ollamaProviderStatus === 'Checking' ? 'inactive' : 'warning';
  const geminiProviderStatus = geminiAvailabilityQuery.isFetching
    ? 'Checking'
    : geminiAvailability?.modelAvailable ? 'Healthy' : 'Not configured';
  const geminiProviderTone = geminiProviderStatus === 'Healthy'
    ? 'enabled'
    : geminiProviderStatus === 'Checking' ? 'inactive' : 'warning';
  const isTranslationConfigValid =
    (aiDraft.translation.baseUrl || aiDraft.chat.baseUrl).trim().length > 0
    && effectiveTranslationModel.length > 0;
  const isEmbeddingConfigValid =
    aiDraft.embedding.baseUrl.trim().length > 0
    && aiDraft.embedding.model.trim().length > 0
    && Number.isInteger(aiDraft.embedding.dimensions)
    && aiDraft.embedding.dimensions > 0;
  const readinessChecks = [
    {
      label: 'Chat provider',
      statusLabel: 'Configured',
      missingLabel: 'No chat provider configured',
      isMet: aiDraft.chat.provider.length > 0 && aiDraft.chat.baseUrl.trim().length > 0,
    },
    {
      label: 'Embedding provider',
      statusLabel: 'Configured',
      missingLabel: 'No embedding provider configured',
      isMet: aiDraft.embedding.provider.length > 0 && aiDraft.embedding.baseUrl.trim().length > 0,
    },
    {
      label: 'Default chat model',
      statusLabel: 'Selected',
      missingLabel: 'No default chat model selected',
      isMet: effectiveDefaultChatModel.length > 0,
    },
    {
      label: 'Translation model',
      statusLabel: 'Selected',
      missingLabel: 'No translation model selected',
      isMet: effectiveTranslationModel.length > 0,
    },
    {
      label: 'Embedding model',
      statusLabel: 'Selected',
      missingLabel: 'No embedding model selected',
      isMet: aiDraft.embedding.model.trim().length > 0,
    },
  ];
  const isAiReady = readinessChecks.every(check => check.isMet);
  const indexProgress = currentIndex
    ? getIndexProgress(currentIndex)
    : chunkCoverage.totalChunkCount > 0
      ? Math.min(100, Math.round((chunkCoverage.indexedChunkCount / chunkCoverage.totalChunkCount) * 100))
      : 0;
  const platformStatus = !aiDraft.aiFeaturesEnabled ? 'Disabled' : isAiReady ? 'Active' : 'Needs configuration';
  const platformTone = !aiDraft.aiFeaturesEnabled ? 'inactive' : isAiReady ? 'enabled' : 'warning';
  const isSemanticIndexIncomplete = aiDraft.aiFeaturesEnabled
    && indexProgress < 100
    && (currentIndex !== null || chunkCoverage.totalChunkCount > 0);
  const semanticStatus = !aiDraft.aiFeaturesEnabled
    ? 'Paused'
    : isSemanticIndexIncomplete ? 'Building'
    : currentIndex
      ? formatIndexStatus(currentIndex.status)
      : isEmbeddingConfigValid ? 'Ready to index' : 'Needs configuration';
  const semanticStatusMessage = aiDraft.aiFeaturesEnabled
    ? 'Indexing continues in the background. Search switches to a new index only after it is ready.'
    : 'Indexing is paused, but your progress is saved. When you enable AI again, indexing will automatically continue from where it left off.';
  const semanticProgressStatus: ChunkProgressVisualStatus = !aiDraft.aiFeaturesEnabled
    ? 'paused'
    : currentIndex?.status === 'failed'
      ? 'failed'
      : isSemanticIndexIncomplete ? 'building' : currentIndex?.status ?? 'idle';
  const semanticIndexTone: SettingsStatusTone = currentIndex?.status === 'failed'
    ? 'warning'
    : !aiDraft.aiFeaturesEnabled
      ? 'inactive'
      : isSemanticIndexIncomplete ? 'warning' : currentIndex ? 'enabled' : 'inactive';
  const chatStatus = chatConnectionStatus === 'Healthy'
    ? 'Ready'
    : isChatConfigValid ? chatConnectionStatus : 'Needs configuration';
  const translationStatus = isTranslationConfigValid
    ? (translationConnectionStatus === 'Error' ? 'Provider error' : 'Ready')
    : 'Needs configuration';
  const indexedChunks = chunkCoverage.indexedChunkCount;
  const configuredEmbeddingModel = savedAiSettings.embedding.model || aiDraft.embedding.model;
  const configuredEmbeddingProvider = savedAiSettings.embedding.provider || aiDraft.embedding.provider;
  const configuredEmbeddingDimensions = savedAiSettings.embedding.dimensions || aiDraft.embedding.dimensions;
  const embeddingModelOptions = useMemo<EmbeddingModelOption[]>(() => {
    const discoveredModels = ollamaModelsQuery.data?.models ?? [];
    const configuredModel = savedAiSettings.embedding.model.trim() || aiDraft.embedding.model.trim();
    const activeModel = activeIndex?.model.trim() ?? '';
    const optionByKey = new Map<string, EmbeddingModelOption>();

    function addModelOption(model: string) {
      if (model.length === 0) return;

      const discovered = discoveredModels.find(item => item.name === model);
      const key = `${aiDraft.embedding.provider}:${aiDraft.embedding.baseUrl}:${model}`;

      optionByKey.set(key, {
        key,
        provider: aiDraft.embedding.provider,
        providerLabel: formatProvider(aiDraft.embedding.provider),
        baseUrl: aiDraft.embedding.baseUrl,
        model,
        dimensions: aiDraft.embedding.dimensions,
        isActive: activeIndex?.provider === aiDraft.embedding.provider && activeIndex.model === model,
        isConfigured: savedAiSettings.embedding.provider === aiDraft.embedding.provider && savedAiSettings.embedding.model === model,
        isDiscovered: discovered !== undefined,
        size: discovered?.size ?? null,
        modifiedAt: discovered?.modifiedAt ?? null,
      });
    }

    for (const catalogModel of popularEmbeddingModelCatalog) {
      if (catalogModel.provider !== aiDraft.embedding.provider) {
        continue;
      }

      for (const discovered of discoveredModels) {
        if (matchesCatalogModel(discovered.name, catalogModel.model)) {
          addModelOption(discovered.name);
        }
      }
    }

    if (discoveredModels.some(item => item.name === configuredModel)) {
      addModelOption(configuredModel);
    }
    if (discoveredModels.some(item => item.name === activeModel)) {
      addModelOption(activeModel);
    }

    return Array.from(optionByKey.values())
      .sort((left, right) =>
        left.providerLabel.localeCompare(right.providerLabel) || left.model.localeCompare(right.model),
      );
  }, [
    activeIndex?.model,
    aiDraft.embedding.baseUrl,
    aiDraft.embedding.dimensions,
    aiDraft.embedding.model,
    aiDraft.embedding.provider,
    ollamaModelsQuery.data?.models,
    activeIndex?.provider,
    savedAiSettings.embedding.model,
    savedAiSettings.embedding.provider,
  ]);
  const selectedEmbeddingModel = embeddingModelOptions.find(option => option.key === selectedEmbeddingModelKey) ?? null;
  const selectedEmbeddingModelChanged = selectedEmbeddingModel !== null && (
    savedAiSettings.embedding.provider !== selectedEmbeddingModel.provider
    || savedAiSettings.embedding.baseUrl !== selectedEmbeddingModel.baseUrl
    || savedAiSettings.embedding.model !== selectedEmbeddingModel.model
    || savedAiSettings.embedding.dimensions !== selectedEmbeddingModel.dimensions
  );

  function mergeAiDraft(next: AiSettingsDraftOverride): AdminAiSettings {
    const merged: AdminAiSettings = {
      ...aiDraft,
      ...next,
      chat: {
        ...aiDraft.chat,
        ...(next.chat ?? {}),
      },
      translation: {
        ...aiDraft.translation,
        ...(next.translation ?? {}),
      },
      embedding: {
        ...aiDraft.embedding,
        ...(next.embedding ?? {}),
      },
    };

    merged.ollamaHost = merged.chat.provider === 'ollama'
      ? merged.chat.baseUrl
      : savedAiSettings.ollamaHost || merged.translation.baseUrl || merged.embedding.baseUrl;
    merged.model = merged.chat.provider === 'ollama'
      ? merged.chat.model
      : savedAiSettings.model || merged.translation.model;
    merged.translation.baseUrl = merged.translation.baseUrl || merged.ollamaHost || merged.embedding.baseUrl;
    return merged;
  }

  function normalizeAiSettingsForSave(settings: AdminAiSettings): AdminAiSettings {
    const chatBaseUrl = settings.chat.baseUrl.trim();
    const configuredModel = settings.chat.model.trim();
    const chatModel = chatModelOptions.length === 0 && configuredModel.length > 0
      ? configuredModel
      : configuredModel.length > 0 && chatModelOptions.includes(configuredModel)
      ? configuredModel
      : effectiveDefaultChatModel.trim();
    const ollamaBaseUrl = settings.chat.provider === 'ollama'
      ? chatBaseUrl
      : (settings.ollamaHost || savedAiSettings.ollamaHost || settings.embedding.baseUrl).trim();
    const translationBaseUrl = (settings.translation.baseUrl || ollamaBaseUrl).trim();
    const configuredTranslation = settings.translation.model.trim();
    const translationModel =
      configuredTranslation.length > 0 && translationModelOptions.includes(configuredTranslation)
        ? configuredTranslation
        : effectiveTranslationModel.trim()
      || savedAiSettings.translation?.model
      || emptyAiSettings.translation.model;
    const embeddingBaseUrl = settings.embedding.baseUrl.trim() || ollamaBaseUrl;
    const embeddingModel = settings.embedding.model.trim() || savedAiSettings.embedding.model || emptyAiSettings.embedding.model;
    const embeddingDimensions = settings.embedding.dimensions > 0
      ? settings.embedding.dimensions
      : savedAiSettings.embedding.dimensions || emptyAiSettings.embedding.dimensions;

    return {
      ...settings,
      chat: {
        ...settings.chat,
        baseUrl: chatBaseUrl,
        apiKeySecretRef: settings.chat.provider === 'gemini'
          ? settings.chat.apiKeySecretRef ?? settings.providers?.gemini?.apiKeySecretRef ?? null
          : null,
        model: chatModel,
        allowedModels: (settings.chat.allowedModels ?? effectiveAllowedChatModels)
          .filter(model => model.trim().length > 0),
      },
      translation: {
        ...settings.translation,
        baseUrl: translationBaseUrl,
        model: translationModel,
      },
      embedding: {
        ...settings.embedding,
        baseUrl: embeddingBaseUrl,
        model: embeddingModel,
        dimensions: embeddingDimensions,
      },
      providers: {
        ...(settings.providers ?? {}),
        gemini: {
          baseUrl: geminiBaseUrl,
          apiKeySecretRef: settings.providers?.gemini?.apiKeySecretRef?.trim() || null,
        },
      },
      ollamaHost: ollamaBaseUrl,
      model: settings.chat.provider === 'ollama' ? chatModel : translationModel,
    };
  }

  const aiSettingsMutation = useMutation({
    mutationFn: (settings: AdminAiSettings) => updateAdminAiSettings(normalizeAiSettingsForSave(settings)),
    onSuccess: async ({ settings }) => {
      toast.success('AI settings saved.');
      setAiDraftOverride(settings);
      queryClient.setQueryData<MeResponse | undefined>(meQueryKeys.all, current =>
        current === undefined
          ? current
          : {
              ...current,
              aiFeaturesEnabled: settings.aiFeaturesEnabled,
            },
      );
      await queryClient.invalidateQueries({ queryKey: adminQueryKeys.aiSettings() });
      await queryClient.invalidateQueries({ queryKey: adminQueryKeys.aiStatus() });
      await queryClient.invalidateQueries({ queryKey: meQueryKeys.all });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not save AI settings.');
    },
  });

  function updateChatDraft(next: Partial<AdminAiSettings['chat']>) {
    setAiDraftOverride(draft => ({ ...draft, chat: { ...(draft.chat ?? {}), ...next } }));
  }

  function updateTranslationDraft(next: Partial<AdminAiProviderSettings>) {
    setAiDraftOverride(draft => ({ ...draft, translation: { ...(draft.translation ?? {}), ...next } }));
  }

  function updateEmbeddingDraft(next: Partial<AdminAiSettings['embedding']>) {
    setAiDraftOverride(draft => ({ ...draft, embedding: { ...(draft.embedding ?? {}), ...next } }));
  }

  function persistAiDraft(next: AiSettingsDraftOverride, options: { confirmEmbeddingChange?: boolean } = {}) {
    const merged = mergeAiDraft(next);
    const nextEmbeddingConfigChanged =
      savedAiSettings.embedding.provider !== merged.embedding.provider
      || savedAiSettings.embedding.baseUrl !== merged.embedding.baseUrl
      || savedAiSettings.embedding.model !== merged.embedding.model
      || savedAiSettings.embedding.dimensions !== merged.embedding.dimensions;

    setAiDraftOverride(merged);

    if (options.confirmEmbeddingChange && nextEmbeddingConfigChanged) {
      const nextOption = embeddingModelOptions.find(option =>
        option.provider === merged.embedding.provider
        && option.baseUrl === merged.embedding.baseUrl
        && option.model === merged.embedding.model,
      );
      setSelectedEmbeddingModelKey(nextOption?.key ?? '');
      setIsEmbeddingModelDialogOpen(true);
      return;
    }

    aiSettingsMutation.mutate(merged);
  }

  function persistProviderSettings() {
    const ollamaBaseUrl = effectiveOllamaBaseUrl.trim();
    if (ollamaBaseUrl.length === 0) {
      return;
    }

    persistAiDraft({
      ...(aiDraft.chat.provider === 'ollama'
        ? { chat: { baseUrl: ollamaBaseUrl } }
        : {}),
      ollamaHost: ollamaBaseUrl,
      translation: {
        baseUrl: ollamaBaseUrl,
      },
      embedding: {
        baseUrl: ollamaBaseUrl,
      },
    });
  }

  function updateOllamaBaseUrl(baseUrl: string) {
    setAiDraftOverride(draft => ({
      ...draft,
      ...(aiDraft.chat.provider === 'ollama'
        ? { chat: { ...(draft.chat ?? {}), baseUrl } }
        : {}),
      ollamaHost: baseUrl,
      translation: { ...(draft.translation ?? {}), baseUrl },
      embedding: { ...(draft.embedding ?? {}), baseUrl },
    }));
  }

  function getGeminiChatDraft() {
    const model = aiDraft.chat.provider === 'gemini' && aiDraft.chat.model
      ? aiDraft.chat.model
      : curatedGeminiChatModels[0];
    const allowedModels = aiDraft.chat.allowedModels ?? [];

    return {
      provider: 'gemini' as const,
      baseUrl: geminiBaseUrl,
      model,
      allowedModels: aiDraft.chat.provider === 'gemini' && allowedModels.length > 0
        ? allowedModels
        : [model],
      apiKeySecretRef: null,
    };
  }

  function openChatModelsDialog() {
    const defaultModel = effectiveDefaultChatModel || chatModelOptions[0] || '';
    const allowed = effectiveAllowedChatModels.length > 0
      ? effectiveAllowedChatModels
      : defaultModel ? [defaultModel] : [];

    setDraftDefaultChatModel(defaultModel);
    setDraftAllowedChatModels(chatModelOptions.filter(model => allowed.includes(model) || model === defaultModel));
    setIsChatModelsDialogOpen(true);
  }

  function updateDraftAllowedChatModel(model: string, checked: boolean) {
    setDraftAllowedChatModels((current) => {
      const next = new Set(current);

      if (checked) {
        next.add(model);
      } else if (model !== draftDefaultChatModel) {
        next.delete(model);
      }

      if (draftDefaultChatModel.length > 0) {
        next.add(draftDefaultChatModel);
      }

      return chatModelOptions.filter(option => next.has(option));
    });
  }

  function updateDraftDefaultChatModel(model: string) {
    setDraftDefaultChatModel(model);
    setDraftAllowedChatModels(current => chatModelOptions.filter(option => current.includes(option) || option === model));
  }

  function saveChatModelsDialog() {
    if (draftDefaultChatModel.length === 0) {
      return;
    }

    const allowed = chatModelOptions.filter(model =>
      draftAllowedChatModels.includes(model) || model === draftDefaultChatModel,
    );
    setIsChatModelsDialogOpen(false);
    persistAiDraft({ chat: { model: draftDefaultChatModel, allowedModels: allowed } });
  }

  return (
    <AdminAccessBoundary
      title="AI settings"
      description="Configure optional AI capabilities and semantic search for this Arkivra instance."
      isEnabled={isEnabled}
      isLoading={meQuery.isLoading}
    >
      <Stack gap="3">
        {aiSettingsQuery.isLoading ? <Text textStyle="sm" color="fg.muted">Loading AI settings...</Text> : null}

        <AiSettingsSection
          title="AI Readiness"
          description="Requirements that must be in place before AI can be enabled."
          tone={isAiReady ? 'success' : 'warning'}
        >
          <Grid templateColumns={{ base: '1fr', xl: 'minmax(0, 1fr) minmax(13rem, 0.32fr)' }} gap="4" alignItems="stretch">
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
                  borderRightWidth={{ base: '0', md: index % 2 === 0 && index !== readinessChecks.length - 1 ? '1px' : '0', xl: index === readinessChecks.length - 1 ? '0' : '1px' }}
                  borderBottomWidth={{ base: index === readinessChecks.length - 1 ? '0' : '1px', md: index === readinessChecks.length - 1 ? '0' : '1px', xl: '0' }}
                  borderColor="border.surface"
                >
                  <RequirementStatus label={check.label} statusLabel={check.statusLabel} missingLabel={check.missingLabel} isMet={check.isMet} />
                </Box>
              ))}
            </SimpleGrid>
            <Box borderLeftWidth={{ base: '0', xl: '1px' }} borderTopWidth={{ base: '1px', xl: '0' }} borderColor="border.surface" ps={{ base: '0', xl: '4' }} pt={{ base: '3', xl: '0' }}>
              <Stack gap="1">
                <Text textStyle="sm" fontWeight="semibold" color={isAiReady ? 'fg.success' : 'fg.warning'}>
                  {isAiReady ? 'All set!' : 'Configuration required'}
                </Text>
                <Text textStyle="sm" color="fg.muted">
                  {isAiReady ? 'You can enable AI features.' : 'Configure the missing requirements before enabling AI.'}
                </Text>
              </Stack>
            </Box>
          </Grid>
        </AiSettingsSection>

        <AiSettingsSection
          title="AI features"
          description="Enable or disable AI capabilities across Arkivra."
          actions={<SettingsStatusBadge tone={platformTone}>{platformStatus}</SettingsStatusBadge>}
        >
          <Grid templateColumns={{ base: '1fr', lg: 'minmax(18rem, 1fr) minmax(16rem, 0.95fr)' }} gap="4">
            <Stack gap="4" minW="0">
              <Stack gap="2.5">
                <Text textStyle="sm" fontWeight="semibold" color="fg">AI features</Text>
                <HStack gap="3">
                  <Switch
                    aria-label="Enable AI features"
                    checked={aiDraft.aiFeaturesEnabled}
                    colorPalette={accentColor}
                    disabled={(!aiDraft.aiFeaturesEnabled && !isAiReady) || aiSettingsMutation.isPending}
                    onCheckedChange={(checked) => {
                      if (checked && !isAiReady) {
                        toast.warning('Complete AI readiness requirements before enabling AI.');
                        return;
                      }

                      persistAiDraft({ aiFeaturesEnabled: checked });
                    }}
                  />
                  <Text textStyle="sm" fontWeight="semibold" color="fg">{aiDraft.aiFeaturesEnabled ? 'Enabled' : 'Disabled'}</Text>
                </HStack>
              </Stack>
              <Text textStyle="sm" color="fg.muted">
                When enabled, semantic search indexing and AI chat capabilities will be available.
              </Text>
            </Stack>

            <Stack gap="3" minW="0" borderLeftWidth={{ base: '0', lg: '1px' }} borderColor="border.surface" pl={{ base: '0', lg: '5' }}>
              <Text textStyle="sm" fontWeight="semibold" color="fg">Feature status</Text>
              <Stack gap="1">
                <CapabilityStatus label="Semantic Search" status={semanticStatus} tone={aiDraft.aiFeaturesEnabled && isEmbeddingConfigValid ? 'ready' : aiDraft.aiFeaturesEnabled ? 'warning' : 'disabled'} />
                <CapabilityStatus label="AI Chat" status={aiDraft.aiFeaturesEnabled ? chatStatus : 'Paused'} tone={aiDraft.aiFeaturesEnabled && isChatConfigValid ? 'ready' : aiDraft.aiFeaturesEnabled ? 'warning' : 'disabled'} />
                <CapabilityStatus label="Translation" status={aiDraft.aiFeaturesEnabled ? translationStatus : 'Paused'} tone={aiDraft.aiFeaturesEnabled && isTranslationConfigValid ? 'ready' : aiDraft.aiFeaturesEnabled ? 'warning' : 'disabled'} />
              </Stack>
            </Stack>
          </Grid>
        </AiSettingsSection>

        <AiSettingsSection
          title="Semantic Search"
          description="The index enables semantic search across your documents."
          actions={
            <>
              <SettingsStatusBadge tone={semanticIndexTone}>
                {semanticStatus}
              </SettingsStatusBadge>
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-label={showSemanticIndexDetails ? 'Hide semantic search details' : 'View semantic search details'}
                onClick={() => setShowSemanticIndexDetails(current => !current)}
              >
                {showSemanticIndexDetails ? 'Hide details' : 'View details'}
              </Button>
            </>
          }
        >
          <Stack gap="4">
            <Grid templateColumns={{ base: '1fr', lg: 'minmax(0, 1.35fr) minmax(18rem, 0.9fr)' }} gap="4" alignItems="stretch">
              <Stack gap="3">
                <SemanticIndexProgressSummary
                  indexedChunks={indexedChunks}
                  expectedChunks={chunkCoverage.totalChunkCount}
                  progress={indexProgress}
                  status={semanticProgressStatus}
                />
                <SimpleGrid columns={{ base: 1, md: 3 }} gap="3">
                  <CompactMetric label="Live index model" value={currentIndex?.model ?? (aiDraft.embedding.model || 'Not selected')} />
                  <CompactMetric label="Index version" value={currentIndex?.id ?? 'No index'} />
                  <CompactMetric label="Last updated" value={formatShortDateTime(currentIndex?.updatedAt)} />
                </SimpleGrid>
                {showSemanticIndexDetails ? (
                  <SimpleGrid columns={{ base: 1, md: 2 }} gap="3">
                    <CompactMetric label="Started time" value={formatShortDateTime(currentIndex?.buildStartedAt ?? currentIndex?.createdAt)} />
                    <CompactMetric label="Expected chunks" value={chunkCoverage.totalChunkCount.toLocaleString()} />
                  </SimpleGrid>
                ) : null}
              </Stack>

              <Box rounded="md" borderWidth="1px" borderColor="blue.muted" bg="blue.subtle" px="4" py="4">
                <Stack gap="2">
                  <HStack gap="2" align="flex-start">
                    <Box color="fg.info" mt="0.5" flexShrink={0}>
                      <Info size={15} />
                    </Box>
                    <Text textStyle="sm" fontWeight="semibold" color="blue.solid">Current status: {semanticStatus}</Text>
                  </HStack>
                  <Text textStyle="sm" color="fg.muted">
                    {semanticStatusMessage}
                  </Text>
                </Stack>
              </Box>
            </Grid>
          </Stack>
        </AiSettingsSection>

        <SimpleGrid columns={{ base: 1, xl: 3 }} gap="3" alignItems="stretch">
          <AiSettingsSection
            title="Embedding"
            description="Configure the model used to create vector embeddings for semantic search."
            minH="19rem"
          >
            <Stack gap="4">
              <Stack gap="2">
                <Text textStyle="xs" fontWeight="semibold" color="fg.muted">Selected model</Text>
                <Flex
                  align="center"
                  justify="space-between"
                  gap="3"
                  rounded="md"
                  borderWidth="1px"
                  borderColor="border.surface"
                  bg="bg.surface"
                  px="3"
                  py="2"
                >
                  <HStack gap="2.5" minW="0">
                    <Flex
                      boxSize="7"
                      align="center"
                      justify="center"
                      rounded="md"
                      borderWidth="1px"
                      borderColor="border.surface"
                      bg="bg.subtle"
                      color="fg.muted"
                      flexShrink={0}
                    >
                      <Package size={17} />
                    </Flex>
                    <Stack gap="0" minW="0">
                      <Text textStyle="sm" fontWeight="semibold" color="fg" truncate>
                        {configuredEmbeddingModel || 'Not selected'}
                      </Text>
                      <Text textStyle="xs" color="fg.muted" truncate>
                        {formatProvider(configuredEmbeddingProvider)}
                        {' · '}
                        {configuredEmbeddingDimensions.toLocaleString()}
                        {' dimensions'}
                      </Text>
                    </Stack>
                  </HStack>
                  <SettingsStatusBadge tone={configuredEmbeddingModel ? 'enabled' : 'inactive'} density="compact">
                    {configuredEmbeddingModel ? 'Selected' : 'Not selected'}
                  </SettingsStatusBadge>
                </Flex>
              </Stack>
              <HStack gap="2" align="center">
                <Text textStyle="xs" fontWeight="semibold" color="fg.muted">Status</Text>
                <SettingsStatusBadge tone={semanticIndexTone} density="compact">
                  {semanticStatus}
                </SettingsStatusBadge>
              </HStack>
              <Alert status="warning" colorPalette="orange" borderColor="orange.muted" bg="orange.subtle" alignItems="flex-start">
                <AlertTriangle size={16} />
                <AlertDescription>
                  <Stack gap="1">
                    <Text fontWeight="semibold">Changing the embedding model requires rebuilding the semantic search index.</Text>
                    <Text>
                      {aiDraft.aiFeaturesEnabled
                        ? 'A full reindexing job will run in the background and may take several hours depending on your data size.'
                        : 'When AI features are enabled, a full reindexing job will run in the background and may take several hours depending on your data size.'}
                    </Text>
                  </Stack>
                </AlertDescription>
              </Alert>
              <Button
                type="button"
                variant="outline"
                size="sm"
                alignSelf="flex-start"
                disabled={!isEmbeddingConfigValid || aiSettingsMutation.isPending}
                onClick={() => {
                  const currentOption = embeddingModelOptions.find(option =>
                    option.provider === savedAiSettings.embedding.provider
                    && option.baseUrl === savedAiSettings.embedding.baseUrl
                    && option.model === savedAiSettings.embedding.model,
                  ) ?? embeddingModelOptions[0];

                  setSelectedEmbeddingModelKey(currentOption?.key ?? '');
                  setIsEmbeddingModelDialogOpen(true);
                }}
              >
                Change model
              </Button>
            </Stack>
          </AiSettingsSection>

          <AiSettingsSection
            title="Chat"
            description="Configure the model used for AI chat responses."
            minH="19rem"
          >
            <Stack gap="4">
              <Stack gap="2">
                <Text textStyle="xs" fontWeight="semibold" color="fg.muted">Selected model</Text>
                <Flex
                  align="center"
                  justify="space-between"
                  gap="3"
                  rounded="md"
                  borderWidth="1px"
                  borderColor="border.surface"
                  bg="bg.surface"
                  px="3"
                  py="2"
                >
                  <HStack gap="2.5" minW="0">
                    <Flex
                      boxSize="7"
                      align="center"
                      justify="center"
                      rounded="md"
                      borderWidth="1px"
                      borderColor="border.surface"
                      bg="bg.subtle"
                      color="fg.muted"
                      flexShrink={0}
                    >
                      <Send size={17} />
                    </Flex>
                    <Stack gap="0" minW="0">
                      <Text textStyle="sm" fontWeight="semibold" color="fg" truncate>
                        {effectiveDefaultChatModel || 'Not selected'}
                      </Text>
                      <Text textStyle="xs" color="fg.muted" truncate>
                        {formatProvider(aiDraft.chat.provider)}
                        {aiDraft.chat.baseUrl ? ` · ${aiDraft.chat.baseUrl}` : ''}
                      </Text>
                    </Stack>
                  </HStack>
                  <SettingsStatusBadge tone={effectiveDefaultChatModel ? 'enabled' : 'inactive'} density="compact">
                    {effectiveDefaultChatModel ? 'Default' : 'Not selected'}
                  </SettingsStatusBadge>
                </Flex>
              </Stack>
              <Stack gap="1.5">
                <Text textStyle="xs" color="fg.muted">Models available to users</Text>
                <HStack gap="2" flexWrap="wrap">
                  <SettingsStatusBadge tone={effectiveAllowedChatModels.length > 0 ? 'enabled' : 'inactive'} density="compact">
                    {effectiveAllowedChatModels.length.toLocaleString()}
                    {' '}
                    allowed
                  </SettingsStatusBadge>
                  <Text textStyle="xs" color="fg.muted">
                    Embedding models are omitted from chat choices.
                  </Text>
                </HStack>
              </Stack>
              <Button
                type="button"
                variant="outline"
                size="sm"
                alignSelf="flex-start"
                disabled={chatModelOptions.length === 0 || aiSettingsMutation.isPending}
                onClick={openChatModelsDialog}
              >
                Configure chat models
              </Button>
            </Stack>
          </AiSettingsSection>

          <AiSettingsSection
            title="Translation"
            description="Configure the model used for document translation."
            minH="19rem"
          >
            <Stack gap="4">
              <Stack gap="2">
                <Text textStyle="xs" fontWeight="semibold" color="fg.muted">Selected model</Text>
                <Flex
                  align="center"
                  justify="space-between"
                  gap="3"
                  rounded="md"
                  borderWidth="1px"
                  borderColor="border.surface"
                  bg="bg.surface"
                  px="3"
                  py="2"
                >
                  <HStack gap="2.5" minW="0">
                    <Flex
                      boxSize="7"
                      align="center"
                      justify="center"
                      rounded="md"
                      borderWidth="1px"
                      borderColor="border.surface"
                      bg="bg.subtle"
                      color="fg.muted"
                      flexShrink={0}
                    >
                      <Languages size={17} />
                    </Flex>
                    <Stack gap="0" minW="0">
                      <Text textStyle="sm" fontWeight="semibold" color="fg" truncate>
                        {effectiveTranslationModel || 'Not selected'}
                      </Text>
                      <Text textStyle="xs" color="fg.muted" truncate>
                        {formatProvider(aiDraft.translation.provider)}
                        {(aiDraft.translation.baseUrl || aiDraft.chat.baseUrl) ? ` · ${aiDraft.translation.baseUrl || aiDraft.chat.baseUrl}` : ''}
                      </Text>
                    </Stack>
                  </HStack>
                  <SettingsStatusBadge tone={effectiveTranslationModel ? 'enabled' : 'inactive'} density="compact">
                    {effectiveTranslationModel ? 'Selected' : 'Not selected'}
                  </SettingsStatusBadge>
                </Flex>
              </Stack>
              <Stack gap="2">
                <Text textStyle="xs" fontWeight="semibold" color="fg.muted">Translation model</Text>
                <Select
                  value={effectiveTranslationModel}
                  disabled={translationModelOptions.length === 0 || aiSettingsMutation.isPending}
                  onValueChange={(model) => {
                    const baseUrl = aiDraft.translation.baseUrl || aiDraft.ollamaHost || aiDraft.embedding.baseUrl;
                    updateTranslationDraft({ model, baseUrl });
                    persistAiDraft({ translation: { model, baseUrl } });
                  }}
                  positioning={{ sameWidth: true }}
                >
                  <SelectTrigger aria-label="Translation model" bg="bg.surface">
                    <SelectValue placeholder="Select translation model" />
                  </SelectTrigger>
                  <SelectContent>
                    {translationModelOptions.map(model => (
                      <SelectItem key={model} value={model}>{model}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Text textStyle="xs" color="fg.muted">
                  Uses the configured Ollama translation endpoint. Choose a model that supports the document inputs you translate.
                </Text>
              </Stack>
              <HStack gap="2" align="center">
                <Text textStyle="xs" fontWeight="semibold" color="fg.muted">Status</Text>
                <SettingsStatusBadge tone={translationConnectionStatus === 'Healthy' ? 'enabled' : translationConnectionStatus === 'Error' ? 'warning' : 'inactive'} density="compact">
                  {translationConnectionStatus}
                </SettingsStatusBadge>
              </HStack>
            </Stack>
          </AiSettingsSection>
        </SimpleGrid>

        <AiSettingsSection
          title="Provider"
          description="Ollama provider configuration, with additional provider slots reserved for future support."
          actions={
            <Button type="button" size="sm" variant="outline" disabled>
              <Plus size={14} />
              Add Provider
            </Button>
          }
        >
          <Stack gap="2" rounded="md" borderWidth="1px" borderColor="border.surface" bg="bg.surface" overflow="hidden">
            <Box>
              <Grid templateColumns={{ base: '1fr', lg: 'minmax(10rem, 1fr) 8rem 7rem minmax(10rem, 0.8fr) auto' }} gap="3" alignItems="center" px="3" py="2.5">
                <Stack gap="0.5" minW="0">
                  <Text textStyle="sm" fontWeight="semibold" color="fg">Ollama</Text>
                  <Text textStyle="xs" color="fg.muted">Chat and embedding provider</Text>
                </Stack>
                <SettingsStatusBadge tone={ollamaProviderTone} density="compact">{ollamaProviderStatus}</SettingsStatusBadge>
                <Text textStyle="sm" color="fg.muted">{ollamaModelsQuery.data?.models.length ?? 0} models</Text>
                <Text textStyle="sm" color="fg.muted">{ollamaModelsQuery.dataUpdatedAt ? formatDate(new Date(ollamaModelsQuery.dataUpdatedAt).toISOString()) : 'Not checked'}</Text>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  aria-label={expandedProvider === 'ollama' ? 'Hide details' : 'View details'}
                  justifySelf={{ base: 'start', lg: 'end' }}
                  onClick={() => setExpandedProvider(value => value === 'ollama' ? null : 'ollama')}
                >
                  {expandedProvider === 'ollama' ? 'Hide details' : 'View details'}
                </Button>
              </Grid>
              {expandedProvider === 'ollama' ? (
                <Box borderTopWidth="1px" borderColor="border.surface" bg="bg.subtle" px="3" py="2">
                  <SettingsRows density="compact">
                    <SettingsRow
                      density="compact"
                      label="Connection information"
                      description="Provider used for chat completions and embeddings."
                      control={aiDraft.chat.provider === 'ollama'
                        ? <SettingsStatusBadge tone="enabled" density="compact">Active for chat</SettingsStatusBadge>
                        : (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={!effectiveOllamaBaseUrl.trim() || aiSettingsMutation.isPending}
                              onClick={() => persistAiDraft({
                                chat: {
                                  provider: 'ollama',
                                  baseUrl: effectiveOllamaBaseUrl,
                                  model: savedAiSettings.model || aiDraft.model || availableOllamaModelNames[0] || '',
                                  allowedModels: savedAiSettings.model || aiDraft.model || availableOllamaModelNames[0]
                                    ? [savedAiSettings.model || aiDraft.model || availableOllamaModelNames[0]]
                                    : [],
                                  apiKeySecretRef: null,
                                },
                              })}
                            >
                              Use for chat
                            </Button>
                          )}
                    />
                    <SettingsRow
                      density="compact"
                      label="Ollama base URL"
                      description="The Ollama endpoint used for chat, translation, and embeddings."
                      control={(
                        <Input
                          aria-label="Ollama base URL"
                          type="url"
                          value={effectiveOllamaBaseUrl}
                          placeholder="http://127.0.0.1:11434"
                          onBlur={persistProviderSettings}
                          onChange={(event) => updateOllamaBaseUrl(event.target.value)}
                        />
                      )}
                    />
                    <SettingsRow density="compact" label="Health status" meta={<Text textStyle="sm" color={ollamaProviderStatus === 'Error' ? 'fg.error' : 'fg'}>{ollamaProviderStatus}</Text>} />
                    <SettingsRow density="compact" label="Available models" meta={<Text textStyle="sm" color="fg">{ollamaModelsQuery.data?.models.map(model => model.name).join(', ') || 'No models discovered'}</Text>} />
                    <SettingsRow density="compact" label="Test connection" control={<Button type="button" size="sm" variant="outline" disabled={ollamaModelsQuery.isFetching || effectiveOllamaBaseUrl.trim().length === 0} onClick={() => void ollamaModelsQuery.refetch()}>{ollamaModelsQuery.isFetching ? 'Checking...' : 'Test connection'}</Button>} />
                  </SettingsRows>
                </Box>
              ) : null}
            </Box>

            <Box borderTopWidth="1px" borderColor="border.surface">
              <Grid templateColumns={{ base: '1fr', lg: 'minmax(10rem, 1fr) 8rem 7rem minmax(10rem, 0.8fr) auto' }} gap="3" alignItems="center" px="3" py="2.5">
                <Stack gap="0.5" minW="0">
                  <Text textStyle="sm" fontWeight="semibold" color="fg">Google Gemini</Text>
                  <Text textStyle="xs" color="fg.muted">Provider support reserved for this instance</Text>
                </Stack>
                <SettingsStatusBadge tone={geminiProviderTone} density="compact">
                  {geminiProviderStatus}
                </SettingsStatusBadge>
                <Text textStyle="sm" color="fg.muted">{curatedGeminiChatModels.length} models</Text>
                <Text textStyle="sm" color="fg.muted">{geminiAvailabilityQuery.dataUpdatedAt ? formatDate(new Date(geminiAvailabilityQuery.dataUpdatedAt).toISOString()) : 'Not checked'}</Text>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  aria-label={expandedProvider === 'gemini' ? 'Hide Google Gemini details' : 'View Google Gemini provider'}
                  justifySelf={{ base: 'start', lg: 'end' }}
                  onClick={() => setExpandedProvider(value => value === 'gemini' ? null : 'gemini')}
                >
                  {expandedProvider === 'gemini' ? 'Hide details' : 'View details'}
                </Button>
              </Grid>
              {expandedProvider === 'gemini' ? (
                <Box borderTopWidth="1px" borderColor="border.surface" bg="bg.subtle" px="3" py="2">
                  <SettingsRows density="compact">
                    <SettingsRow
                      density="compact"
                      label="Connection information"
                      description="Gemini chat uses Google AI Studio's OpenAI-compatible API."
                      control={aiDraft.chat.provider === 'gemini'
                        ? <SettingsStatusBadge tone="enabled" density="compact">Active for chat</SettingsStatusBadge>
                        : (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={!geminiAvailability?.modelAvailable || aiSettingsMutation.isPending}
                              onClick={() => persistAiDraft({ chat: getGeminiChatDraft() })}
                            >
                              Use for chat
                            </Button>
                          )}
                    />
                    <SettingsRow density="compact" label="Health status" meta={<Text textStyle="sm" color={geminiAvailability?.error ? 'fg.error' : 'fg'}>{geminiAvailability?.error ?? geminiProviderStatus}</Text>} />
                    <SettingsRow density="compact" label="Available models" meta={curatedGeminiChatModels.join(', ')} />
                    <SettingsRow density="compact" label="Test connection" control={<Button type="button" size="sm" variant="outline" disabled={geminiAvailabilityQuery.isFetching} onClick={() => void geminiAvailabilityQuery.refetch()}>{geminiAvailabilityQuery.isFetching ? 'Checking...' : 'Test connection'}</Button>} />
                  </SettingsRows>
                </Box>
              ) : null}
            </Box>
          </Stack>
        </AiSettingsSection>
      </Stack>

      <Dialog open={isChatModelsDialogOpen} onOpenChange={setIsChatModelsDialogOpen}>
        <DialogContent maxW="40rem" w="calc(100vw - 2rem)">
          <DialogHeader px="5" pt="5" pb="3">
            <DialogTitle>Configure chat models</DialogTitle>
            <DialogDescription>
              Select which chat models users can choose and set the default model. Embedding models are omitted from this list.
            </DialogDescription>
          </DialogHeader>
          <DialogBody px="5" pb="4">
            <Box rounded="md" borderWidth="1px" borderColor="border.surface" bg="bg.surface" overflow="hidden">
              <Box px="3" py="2" borderBottomWidth="1px" borderColor="border.surface">
                <Grid templateColumns="minmax(0, 1fr) minmax(7rem, auto)" gap="3" alignItems="center">
                  <Text textStyle="sm" fontWeight="semibold" color="fg">Available chat models</Text>
                  <Text textStyle="xs" color="fg.muted" textAlign="end">Default</Text>
                </Grid>
              </Box>
              {chatModelOptions.length > 0 ? (
                <RadioGroup
                  name="default-chat-model"
                  value={draftDefaultChatModel}
                  onValueChange={updateDraftDefaultChatModel}
                  gap="0"
                  divideY="1px"
                  divideColor="border.surface"
                >
                  {chatModelOptions.map(model => (
                    <Grid
                      key={model}
                      templateColumns="minmax(0, 1fr) minmax(7rem, auto)"
                      gap="3"
                      alignItems="center"
                      px="3"
                      py="2.5"
                      _hover={{ bg: 'bg.subtle' }}
                    >
                      <Checkbox
                        checked={draftAllowedChatModels.includes(model)}
                        disabled={model === draftDefaultChatModel}
                        onCheckedChange={(checked) => updateDraftAllowedChatModel(model, checked)}
                      >
                        <Stack gap="0" minW="0">
                          <Text textStyle="sm" fontWeight="semibold" color={model === draftDefaultChatModel ? 'fg.muted' : 'fg'} truncate>
                            {model}
                          </Text>
                          <Text textStyle="xs" color="fg.muted" truncate>
                            {formatProvider(aiDraft.chat.provider)}
                            {aiDraft.chat.baseUrl ? ` · ${aiDraft.chat.baseUrl}` : ''}
                          </Text>
                        </Stack>
                      </Checkbox>
                      <HStack as="label" gap="2" justify="flex-end" cursor="pointer">
                        <RadioGroupItem value={model} />
                        <Text textStyle="xs" color={model === draftDefaultChatModel ? 'fg' : 'fg.muted'}>
                          {model === draftDefaultChatModel ? 'Default' : 'Use'}
                        </Text>
                      </HStack>
                    </Grid>
                  ))}
                </RadioGroup>
              ) : (
                <Text px="3" py="3" textStyle="sm" color="fg.muted">
                  {chatModelsQuery.isFetching ? 'Loading chat models from Ollama...' : 'No chat models are available from the configured Ollama endpoint.'}
                </Text>
              )}
            </Box>
          </DialogBody>
          <DialogFooter px="5" pb="5" pt="0">
            <Button type="button" size="sm" variant="outline" onClick={() => setIsChatModelsDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={draftDefaultChatModel.length === 0 || aiSettingsMutation.isPending}
              onClick={saveChatModelsDialog}
            >
              {aiSettingsMutation.isPending ? 'Saving...' : 'Save chat models'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isEmbeddingModelDialogOpen} onOpenChange={setIsEmbeddingModelDialogOpen}>
        <DialogContent maxW="38rem" w="calc(100vw - 2rem)">
          <DialogHeader px="5" pt="5" pb="3">
            <DialogTitle>Change embedding model</DialogTitle>
            <DialogDescription>
              Select the model Arkivra should use for new semantic indexes. The live index keeps serving search until the new one is ready.
            </DialogDescription>
          </DialogHeader>
          <DialogBody px="5" pb="4">
            <Stack gap="4">
              <Box rounded="md" borderWidth="1px" borderColor="border.surface" bg="bg.surface" overflow="hidden">
                <Box px="3" py="2" borderBottomWidth="1px" borderColor="border.surface">
                  <Text textStyle="sm" fontWeight="semibold" color="fg">Available embedding models</Text>
                </Box>
                {embeddingModelOptions.length > 0 ? (
                  <RadioGroup
                    name="embedding-model"
                    value={selectedEmbeddingModelKey}
                    onValueChange={setSelectedEmbeddingModelKey}
                    gap="0"
                    divideY="1px"
                    divideColor="border.surface"
                  >
                    {embeddingModelOptions.map(option => (
                      <Flex
                        key={option.key}
                        as="label"
                        align="center"
                        justify="space-between"
                        gap="3"
                        px="3"
                        py="2.5"
                        cursor="pointer"
                        _hover={{ bg: 'bg.subtle' }}
                      >
                        <HStack gap="2.5" minW="0" align="center">
                          <RadioGroupItem value={option.key} />
                          <Stack gap="0" minW="0">
                            <Text textStyle="sm" fontWeight="semibold" color="fg" truncate>
                              {option.model}
                            </Text>
                            <Text textStyle="xs" color="fg.muted" truncate>
                              {option.providerLabel}
                              {option.baseUrl ? ` · ${option.baseUrl}` : ''}
                            </Text>
                          </Stack>
                        </HStack>
                        <HStack gap="1.5" flexShrink={0}>
                          {option.isConfigured ? <Badge variant="secondary" colorPalette="teal">Selected</Badge> : null}
                          {option.isActive && !option.isConfigured ? <Badge variant="outline">Live index</Badge> : null}
                          {!option.isDiscovered ? <Badge variant="outline" colorPalette="gray">Not listed</Badge> : null}
                        </HStack>
                      </Flex>
                    ))}
                  </RadioGroup>
                ) : (
                  <Text px="3" py="3" textStyle="sm" color="fg.muted">
                    {ollamaModelsQuery.isFetching ? 'Loading models from Ollama...' : 'No catalog embedding models were found from the configured Ollama endpoint.'}
                  </Text>
                )}
              </Box>
              <Alert status="warning" colorPalette="orange" borderColor="orange.muted" bg="orange.subtle" alignItems="flex-start">
                <AlertTriangle size={16} />
                <AlertDescription>
                  <Stack gap="2">
                    <Text fontWeight="semibold">Changing the embedding model requires rebuilding the semantic search index.</Text>
                    <Stack as="ul" gap="1" ps="4">
                      <Text as="li">The current index will remain available until the new index is ready.</Text>
                      <Text as="li">
                        {aiDraft.aiFeaturesEnabled
                          ? 'A full reindexing job will run in the background.'
                          : 'When AI features are enabled, a full reindexing job will run in the background.'}
                      </Text>
                      <Text as="li">This may take several hours depending on your data size.</Text>
                    </Stack>
                  </Stack>
                </AlertDescription>
              </Alert>
            </Stack>
          </DialogBody>
          <DialogFooter px="5" pb="5" pt="0">
            <Button type="button" size="sm" variant="outline" onClick={() => setIsEmbeddingModelDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={selectedEmbeddingModel === null || !selectedEmbeddingModelChanged || aiSettingsMutation.isPending}
              onClick={() => {
                if (selectedEmbeddingModel === null) return;

                setIsEmbeddingModelDialogOpen(false);
                aiSettingsMutation.mutate(mergeAiDraft({
                  embedding: {
                    provider: selectedEmbeddingModel.provider,
                    baseUrl: selectedEmbeddingModel.baseUrl,
                    model: selectedEmbeddingModel.model,
                    dimensions: selectedEmbeddingModel.dimensions,
                  },
                }));
              }}
            >
              {aiSettingsMutation.isPending ? 'Saving...' : 'Confirm and rebuild'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminAccessBoundary>
  );
}
