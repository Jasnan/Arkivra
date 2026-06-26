import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Box, Flex, Grid, HStack, SimpleGrid, Stack, Text, chakra } from '@chakra-ui/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  BookOpen,
  Bot,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  Info,
  Languages,
  MessageSquare,
  Package,
  Play,
  RefreshCw,
  Search,
  Settings,
  Sparkles,
  TriangleAlert,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { toast } from '@/components/ui/toaster-store';
import { updateAdminAiSettings } from '@/features/admin/admin.api';
import {
  adminQueryKeys,
  useAdminAiAvailabilityQuery,
  useAdminAiModelCatalogQuery,
  useAdminAiSettingsQuery,
  useAdminAiStatusQuery,
} from '@/features/admin/admin.queries';
import type {
  AdminAiAvailability,
  AdminAiModelCapability,
  AdminAiModelCatalogEntry,
  AdminAiSettings,
} from '@/features/admin/admin.types';
import { meQueryKeys, useMeQuery } from '@/features/me/me.queries';
import type { MeResponse } from '@/features/me/me.types';
import aiFeaturesIllustration from '@/assets/ai-features.png';
import { AdminAccessBoundary } from './admin-shared';
import {
  ChatModelsDialog,
  EmbeddingModelDialog,
  TranslationModelDialog,
} from './admin-ai-settings-page-dialogs';
import type { TranslationModelOption } from './admin-ai-settings-page-dialogs';
import {
  buildEmbeddingModelOptions,
  formatProvider,
  geminiBaseUrl,
  hasModelCapability,
  isSameOllamaModel,
} from './admin-ai-settings-page-model-catalog';
import type { EmbeddingModelOption } from './admin-ai-settings-page-model-catalog';
import { emptyAiSettings } from './admin-ai-settings-page-state';
import type { AiSettingsDraftOverride } from './admin-ai-settings-page-state';
import { formatIndexStatus, getIndexProgress } from './admin-ai-settings-page-status-helpers';
import type { ChunkProgressVisualStatus } from './admin-ai-settings-page-sections';
import { ChunkProgressBar } from './admin-ai-settings-page-sections';

export interface ChatModelOption {
  value: string;
  provider: AdminAiSettings['chat']['provider'];
  providerLabel: string;
  model: string;
  label: string;
  baseUrl: string;
  description?: string | null;
  capabilities: string[];
}

type AiSetupState = 'no_providers' | 'no_search_engines' | 'needs_search_engine' | 'ready' | 'enabled';

interface SearchEngine {
  provider: NonNullable<AdminAiSettings['embedding']['provider']>;
  baseUrl: string;
  model: string;
  dimensions: number;
}

interface AiSetupStatus {
  state: AiSetupState;
  configuredProviders: number;
  healthyProviders: number;
  aiEnabled: boolean;
  selectedSearchEngine?: SearchEngine;
}

interface AiProviderSummary {
  id: 'ollama' | 'gemini';
  name: string;
  description: string;
  endpoint: string;
  status: string;
  tone: 'enabled' | 'inactive' | 'warning';
  isConfigured: boolean;
  isHealthy: boolean;
  modelCount: number;
  models: string[];
  updatedAt: number;
  error: string | null;
  isChecking: boolean;
  onRefresh: () => void;
}

function getAiSetupStatus({
  aiEnabled,
  providers,
  selectedSearchEngine,
  searchEngineCount,
}: {
  aiEnabled: boolean;
  providers: AiProviderSummary[];
  selectedSearchEngine?: SearchEngine;
  searchEngineCount: number;
}): AiSetupStatus {
  const configuredProviders = providers.filter((provider) => provider.isConfigured).length;
  const healthyProviders = providers.filter((provider) => provider.isHealthy).length;

  if (configuredProviders === 0) {
    return {
      state: 'no_providers',
      configuredProviders,
      healthyProviders,
      aiEnabled,
    };
  }

  if (selectedSearchEngine === undefined) {
    return {
      state: searchEngineCount > 0 ? 'needs_search_engine' : 'no_search_engines',
      configuredProviders,
      healthyProviders,
      aiEnabled,
    };
  }

  return {
    state: aiEnabled ? 'enabled' : 'ready',
    configuredProviders,
    healthyProviders,
    aiEnabled,
    selectedSearchEngine,
  };
}

function getCatalogLabel(model: AdminAiModelCatalogEntry) {
  return model.label ?? model.model;
}

function mapOllamaCapabilities(capabilities: readonly string[]) {
  const mapped = new Set<AdminAiModelCapability>();

  for (const capability of capabilities) {
    const normalized = capability.trim().toLowerCase();
    if (normalized === 'completion') {
      mapped.add('chat');
      continue;
    }

    if (normalized === 'chat' || normalized === 'vision' || normalized === 'embedding') {
      mapped.add(normalized);
    }
  }

  return Array.from(mapped);
}

function buildAvailableOllamaModels({
  availability,
  catalogModels,
}: {
  availability?: AdminAiAvailability;
  catalogModels: AdminAiModelCatalogEntry[];
}) {
  if (availability?.reachable !== true) return [];

  const modelsByName = new Map<string, AdminAiModelCatalogEntry>();

  for (const liveModel of availability.models) {
    if (liveModel.available === false) continue;

    const catalogModel = catalogModels.find(
      (model) => model.provider === 'ollama' && isSameOllamaModel(model.model, liveModel.name),
    );
    const capabilities = mapOllamaCapabilities([
      ...liveModel.capabilities,
      ...(catalogModel?.capabilities ?? []),
    ]);

    if (capabilities.length === 0) continue;

    modelsByName.set(liveModel.name, {
      provider: 'ollama',
      model: liveModel.name,
      label: catalogModel?.label ?? liveModel.description ?? liveModel.name,
      capabilities,
      embeddingDimensions: catalogModel?.embeddingDimensions ?? liveModel.embeddingDimensions,
    });
  }

  return Array.from(modelsByName.values()).sort((left, right) =>
    left.model.localeCompare(right.model),
  );
}

function formatChatModelValue({
  provider,
  model,
}: {
  provider: AdminAiSettings['chat']['provider'];
  model: string;
}) {
  return `${provider}:${model}`;
}

function parseChatModelValue({
  value,
  fallbackProvider,
}: {
  value: string;
  fallbackProvider: AdminAiSettings['chat']['provider'];
}): {
  provider: AdminAiSettings['chat']['provider'];
  model: string;
  value: string;
} {
  const trimmed = value.trim();
  const separator = trimmed.indexOf(':');
  const maybeProvider = separator > 0 ? trimmed.slice(0, separator) : '';

  if (maybeProvider === 'ollama' || maybeProvider === 'gemini') {
    const model = trimmed.slice(separator + 1).trim();
    return {
      provider: maybeProvider,
      model,
      value: formatChatModelValue({ provider: maybeProvider, model }),
    };
  }

  return {
    provider: fallbackProvider,
    model: trimmed,
    value: formatChatModelValue({ provider: fallbackProvider, model: trimmed }),
  };
}

export function AdminAiSettingsPage() {
  const queryClient = useQueryClient();
  const meQuery = useMeQuery();
  const isEnabled = meQuery.data?.isAdmin === true;
  const aiSettingsQuery = useAdminAiSettingsQuery({ enabled: isEnabled });
  const aiStatusQuery = useAdminAiStatusQuery({ enabled: isEnabled });
  const aiModelCatalogQuery = useAdminAiModelCatalogQuery({ enabled: isEnabled });
  const [aiDraftOverride, setAiDraftOverride] = useState<AiSettingsDraftOverride>({});
  const [expandedProvider, setExpandedProvider] = useState<'ollama' | 'gemini' | null>(null);
  const [isChatModelsDialogOpen, setIsChatModelsDialogOpen] = useState(false);
  const [draftAllowedChatModels, setDraftAllowedChatModels] = useState<string[]>([]);
  const [draftDefaultChatModel, setDraftDefaultChatModel] = useState('');
  const [isEmbeddingModelDialogOpen, setIsEmbeddingModelDialogOpen] = useState(false);
  const [selectedEmbeddingModelKey, setSelectedEmbeddingModelKey] = useState('');
  const [autoPromptedSearchEngineKey, setAutoPromptedSearchEngineKey] = useState<string | null>(
    null,
  );
  const [isTranslationModelDialogOpen, setIsTranslationModelDialogOpen] = useState(false);
  const [selectedTranslationModelKey, setSelectedTranslationModelKey] = useState('');
  const [showProviderDetails, setShowProviderDetails] = useState(false);
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
  aiDraft.ollamaHost =
    aiDraft.chat.provider === 'ollama'
      ? aiDraft.chat.baseUrl
      : savedAiSettings.ollamaHost || aiDraft.translation.baseUrl || aiDraft.embedding.baseUrl;
  aiDraft.model =
    aiDraft.chat.provider === 'ollama'
      ? aiDraft.chat.model
      : savedAiSettings.model || aiDraft.translation.model;
  aiDraft.translation.baseUrl =
    aiDraft.translation.baseUrl || aiDraft.ollamaHost || aiDraft.embedding.baseUrl;
  const effectiveOllamaBaseUrl =
    aiDraft.chat.provider === 'ollama'
      ? aiDraft.chat.baseUrl
      : aiDraft.ollamaHost || aiDraft.translation.baseUrl || aiDraft.embedding.baseUrl;
  const aiStatus = aiStatusQuery.data?.status;
  const activeIndex = aiStatus?.embedding.activeIndex ?? null;
  const preparingIndex =
    aiStatus?.embedding.candidateIndexes.find(
      (index) => index.status === 'building' || index.status === 'ready',
    ) ?? null;
  const currentIndex = preparingIndex ?? activeIndex;
  const chunkCoverage = aiStatus?.embedding.chunkCoverage ?? {
    indexedChunkCount: 0,
    totalChunkCount: 0,
  };
  const catalogModels = useMemo(
    () => aiModelCatalogQuery.data?.models ?? [],
    [aiModelCatalogQuery.data?.models],
  );
  const geminiCatalogModels = useMemo(
    () => catalogModels.filter((model) => model.provider === 'gemini'),
    [catalogModels],
  );
  const ollamaCatalogModels = useMemo(
    () => catalogModels.filter((model) => model.provider === 'ollama'),
    [catalogModels],
  );
  const firstGeminiChatModel =
    geminiCatalogModels.find((model) => hasModelCapability(model, 'chat'))?.model ??
    (aiDraft.chat.provider === 'gemini' ? aiDraft.chat.model : '');
  const isGeminiConfigured = aiDraft.providers?.gemini?.configured === true;
  const firstOllamaChatModel =
    ollamaCatalogModels.find((model) => hasModelCapability(model, 'chat'))?.model ??
    (aiDraft.chat.provider === 'ollama' ? aiDraft.chat.model : aiDraft.model);
  const geminiAvailabilityQuery = useAdminAiAvailabilityQuery({
    host: geminiBaseUrl,
    model: firstGeminiChatModel,
    provider: 'gemini',
    enabled: isEnabled && isGeminiConfigured && firstGeminiChatModel.length > 0,
  });
  const geminiAvailability = geminiAvailabilityQuery.data?.availability;
  const isGeminiProviderHealthy = geminiAvailability?.modelAvailable === true;
  const ollamaAvailabilityQuery = useAdminAiAvailabilityQuery({
    host: effectiveOllamaBaseUrl,
    provider: 'ollama',
    model: firstOllamaChatModel,
    enabled:
      isEnabled &&
      effectiveOllamaBaseUrl.trim().length > 0 &&
      firstOllamaChatModel.trim().length > 0,
  });
  const ollamaAvailability = ollamaAvailabilityQuery.data?.availability;
  const isOllamaProviderReachable = ollamaAvailability?.reachable === true;
  const isOllamaSelectedModelAvailable = ollamaAvailability?.modelAvailable === true;
  const isOllamaProviderHealthy = isOllamaProviderReachable;
  const availableGeminiChatModels = useMemo(
    () =>
      isGeminiProviderHealthy
        ? geminiCatalogModels.filter((model) => hasModelCapability(model, 'chat'))
        : [],
    [geminiCatalogModels, isGeminiProviderHealthy],
  );
  const availableOllamaModels = useMemo(
    () =>
      buildAvailableOllamaModels({
        availability: ollamaAvailability,
        catalogModels: ollamaCatalogModels,
      }),
    [ollamaAvailability, ollamaCatalogModels],
  );
  const chatModelOptions = useMemo<ChatModelOption[]>(() => {
    const geminiOptions = availableGeminiChatModels.map((model) => ({
      value: formatChatModelValue({ provider: 'gemini', model: model.model }),
      provider: 'gemini' as const,
      providerLabel: 'Gemini',
      model: model.model,
      label: getCatalogLabel(model),
      baseUrl: geminiBaseUrl,
      description: model.label ?? null,
      capabilities: model.capabilities,
    }));
    const ollamaOptions = availableOllamaModels
      .filter((model) => hasModelCapability(model, 'chat'))
      .map((model) => ({
        value: formatChatModelValue({ provider: 'ollama', model: model.model }),
        provider: 'ollama' as const,
        providerLabel: 'Ollama',
        model: model.model,
        label: getCatalogLabel(model),
        baseUrl: effectiveOllamaBaseUrl,
        description: model.label ?? null,
        capabilities: model.capabilities,
      }));

    return [...geminiOptions, ...ollamaOptions];
  }, [availableGeminiChatModels, availableOllamaModels, effectiveOllamaBaseUrl]);
  const chatModelValues = useMemo(
    () => chatModelOptions.map((option) => option.value),
    [chatModelOptions],
  );
  const translationModelOptions = useMemo<TranslationModelOption[]>(() => {
    const geminiOptions = availableGeminiChatModels
      .filter((model) => hasModelCapability(model, 'chat') && hasModelCapability(model, 'vision'))
      .map((model) => ({
        key: formatChatModelValue({ provider: 'gemini', model: model.model }),
        provider: 'gemini' as const,
        providerLabel: 'Gemini',
        model: model.model,
        label: getCatalogLabel(model),
        baseUrl: geminiBaseUrl,
        description: model.label ?? null,
        capabilities: model.capabilities,
        isConfigured:
          aiDraft.translation.provider === 'gemini' && aiDraft.translation.model === model.model,
      }));
    const ollamaOptions = availableOllamaModels
      .filter((model) => hasModelCapability(model, 'chat') && hasModelCapability(model, 'vision'))
      .map((model) => ({
        key: formatChatModelValue({ provider: 'ollama', model: model.model }),
        provider: 'ollama' as const,
        providerLabel: 'Ollama',
        model: model.model,
        label: getCatalogLabel(model),
        baseUrl: effectiveOllamaBaseUrl,
        description: model.label ?? null,
        capabilities: model.capabilities,
        isConfigured:
          aiDraft.translation.provider === 'ollama' && aiDraft.translation.model === model.model,
      }));

    return [...geminiOptions, ...ollamaOptions];
  }, [
    aiDraft.translation.model,
    aiDraft.translation.provider,
    availableGeminiChatModels,
    availableOllamaModels,
    effectiveOllamaBaseUrl,
  ]);
  const translationModelKeys = useMemo(
    () => translationModelOptions.map((option) => option.key),
    [translationModelOptions],
  );
  const configuredChatSelection = parseChatModelValue({
    value: aiDraft.chat.model.trim(),
    fallbackProvider: aiDraft.chat.provider,
  });
  const configuredChatModel = configuredChatSelection.value;
  const isConfiguredChatModelAvailable =
    configuredChatModel.length > 0 && chatModelValues.includes(configuredChatModel);
  const effectiveDefaultChatModel = isConfiguredChatModelAvailable ? configuredChatModel : '';
  const effectiveDefaultChatSelection = parseChatModelValue({
    value: effectiveDefaultChatModel || configuredChatModel,
    fallbackProvider: aiDraft.chat.provider,
  });
  const effectiveDefaultChatOption =
    chatModelOptions.find((option) => option.value === effectiveDefaultChatModel) ?? null;
  const configuredTranslationModel =
    aiDraft.translation.model.trim() || savedAiSettings.translation?.model?.trim() || '';
  const configuredTranslationModelKey = configuredTranslationModel
    ? formatChatModelValue({
        provider: aiDraft.translation.provider,
        model: configuredTranslationModel,
      })
    : '';
  const isConfiguredTranslationModelAvailable =
    configuredTranslationModel.length > 0 &&
    translationModelKeys.includes(configuredTranslationModelKey);
  const effectiveTranslationOption =
    (isConfiguredTranslationModelAvailable
      ? translationModelOptions.find((option) => option.key === configuredTranslationModelKey)
      : null) ?? null;
  const effectiveTranslationModel = effectiveTranslationOption?.model ?? configuredTranslationModel;
  const selectedTranslationModel =
    translationModelOptions.find((option) => option.key === selectedTranslationModelKey) ?? null;
  const selectedTranslationModelChanged =
    selectedTranslationModel !== null &&
    (aiDraft.translation.provider !== selectedTranslationModel.provider ||
      aiDraft.translation.baseUrl !== selectedTranslationModel.baseUrl ||
      aiDraft.translation.model !== selectedTranslationModel.model);
  const savedAllowedChatModels = aiDraft.chat.allowedModels ?? [];
  const savedAllowedChatModelValues = savedAllowedChatModels.map(
    (model) => parseChatModelValue({ value: model, fallbackProvider: aiDraft.chat.provider }).value,
  );
  const effectiveAllowedChatModels =
    savedAllowedChatModels.length === 0
      ? effectiveDefaultChatModel.length > 0
        ? chatModelValues.filter((model) => model === effectiveDefaultChatModel)
        : []
      : chatModelValues.filter(
          (model) =>
            savedAllowedChatModelValues.includes(model) || model === effectiveDefaultChatModel,
        );
  const isChatConfigValid =
    effectiveDefaultChatModel.length > 0 &&
    ((effectiveDefaultChatSelection.provider === 'gemini' && isGeminiProviderHealthy) ||
      (effectiveDefaultChatSelection.provider === 'ollama' &&
        isConfiguredChatModelAvailable &&
        (effectiveDefaultChatOption?.baseUrl ?? '').trim().length > 0));
  const ollamaProviderStatus =
    effectiveOllamaBaseUrl.trim().length === 0
      ? 'Not Configured'
      : ollamaAvailabilityQuery.isFetching
        ? 'Checking'
        : ollamaAvailabilityQuery.isError
          ? 'Error'
          : isOllamaSelectedModelAvailable
            ? 'Healthy'
            : isOllamaProviderReachable
              ? 'Reachable'
              : 'Unavailable';
  const ollamaProviderTone =
    ollamaProviderStatus === 'Healthy' || ollamaProviderStatus === 'Reachable'
      ? 'enabled'
      : ollamaProviderStatus === 'Checking'
        ? 'inactive'
        : 'warning';
  const geminiProviderStatus = !isGeminiConfigured
    ? 'Not configured'
    : geminiAvailabilityQuery.isFetching
      ? 'Checking'
      : geminiAvailability?.modelAvailable
        ? 'Healthy'
        : 'Unavailable';
  const geminiProviderTone =
    geminiProviderStatus === 'Healthy'
      ? 'enabled'
      : geminiProviderStatus === 'Checking'
        ? 'inactive'
        : 'warning';
  const isTranslationConfigValid =
    (
      effectiveTranslationOption?.baseUrl ??
      (aiDraft.translation.baseUrl || aiDraft.chat.baseUrl)
    ).trim().length > 0 &&
    effectiveTranslationModel.length > 0 &&
    effectiveTranslationOption !== null &&
    ((effectiveTranslationOption.provider === 'gemini' && isGeminiProviderHealthy) ||
      (effectiveTranslationOption.provider === 'ollama' && isConfiguredTranslationModelAvailable));
  const isTranslationModelMultimodal =
    effectiveTranslationModel.length > 0 &&
    (effectiveTranslationOption?.capabilities.includes('vision') ?? false);
  const selectedEmbeddingProviderModel =
    aiDraft.embedding.provider === 'ollama' && aiDraft.embedding.model !== null
      ? availableOllamaModels.find(
          (model) =>
            model.provider === 'ollama' &&
            hasModelCapability(model, 'embedding') &&
            isSameOllamaModel(model.model, aiDraft.embedding.model ?? ''),
        )
      : undefined;
  const isSelectedEmbeddingModelConfirmedMissing =
    aiDraft.embedding.provider === 'ollama' &&
    isOllamaProviderReachable &&
    selectedEmbeddingProviderModel === undefined;
  const isEmbeddingSelectionConfigured =
    aiDraft.embedding.provider !== null &&
    aiDraft.embedding.baseUrl.trim().length > 0 &&
    (aiDraft.embedding.model?.trim().length ?? 0) > 0 &&
    Number.isInteger(aiDraft.embedding.dimensions) &&
    (aiDraft.embedding.dimensions ?? 0) > 0;
  const selectedSearchEngine =
    isEmbeddingSelectionConfigured && !isSelectedEmbeddingModelConfirmedMissing
      ? {
          provider: aiDraft.embedding.provider!,
          baseUrl: aiDraft.embedding.baseUrl,
          model: aiDraft.embedding.model!,
          dimensions: aiDraft.embedding.dimensions!,
        }
      : undefined;
  const isEmbeddingConfigValid = selectedSearchEngine !== undefined;
  const indexProgress = currentIndex
    ? getIndexProgress(currentIndex)
    : chunkCoverage.totalChunkCount > 0
      ? Math.min(
          100,
          Math.round((chunkCoverage.indexedChunkCount / chunkCoverage.totalChunkCount) * 100),
        )
      : 0;
  const hasIndexableChunks = chunkCoverage.totalChunkCount > 0;
  const isSemanticIndexIncomplete =
    aiDraft.aiFeaturesEnabled &&
    hasIndexableChunks &&
    indexProgress < 100 &&
    (currentIndex !== null || chunkCoverage.totalChunkCount > 0);
  const semanticStatus = !aiDraft.aiFeaturesEnabled
    ? 'Paused'
    : !isEmbeddingConfigValid
      ? 'Needs configuration'
      : !hasIndexableChunks
        ? 'No documents'
        : isSemanticIndexIncomplete
          ? 'Building'
          : currentIndex
            ? formatIndexStatus(currentIndex.status)
            : 'Ready to index';
  const semanticProgressStatus: ChunkProgressVisualStatus = !aiDraft.aiFeaturesEnabled
    ? 'paused'
    : !hasIndexableChunks || !isEmbeddingConfigValid
      ? 'idle'
      : currentIndex?.status === 'failed'
        ? 'failed'
        : isSemanticIndexIncomplete
          ? 'building'
          : (currentIndex?.status ?? 'idle');
  const indexedChunks = chunkCoverage.indexedChunkCount;
  const configuredEmbeddingProvider =
    savedAiSettings.embedding.provider ?? aiDraft.embedding.provider;
  const embeddingModelOptions = useMemo<EmbeddingModelOption[]>(() => {
    return buildEmbeddingModelOptions({
      activeIndex,
      baseUrl: aiDraft.embedding.baseUrl || effectiveOllamaBaseUrl,
      catalogModels: availableOllamaModels,
      model: aiDraft.embedding.model,
      provider: aiDraft.embedding.provider,
      savedEmbedding: savedAiSettings.embedding,
    });
  }, [
    activeIndex,
    aiDraft.embedding.baseUrl,
    aiDraft.embedding.model,
    aiDraft.embedding.provider,
    availableOllamaModels,
    effectiveOllamaBaseUrl,
    savedAiSettings.embedding,
  ]);
  const selectedEmbeddingModel =
    embeddingModelOptions.find((option) => option.key === selectedEmbeddingModelKey) ?? null;
  const selectableEmbeddingModelOptions = useMemo(
    () => embeddingModelOptions.filter((option) => option.isInCatalog),
    [embeddingModelOptions],
  );
  const selectedEmbeddingModelChanged =
    selectedEmbeddingModel !== null &&
    (savedAiSettings.embedding.provider !== selectedEmbeddingModel.provider ||
      savedAiSettings.embedding.baseUrl !== selectedEmbeddingModel.baseUrl ||
      savedAiSettings.embedding.model !== selectedEmbeddingModel.model ||
      savedAiSettings.embedding.dimensions !== selectedEmbeddingModel.dimensions);
  const providerSummaries: AiProviderSummary[] = [
    {
      id: 'gemini',
      name: 'Google Gemini',
      description: 'Hosted provider',
      endpoint: geminiBaseUrl,
      status: geminiProviderStatus,
      tone: geminiProviderTone,
      isConfigured: isGeminiConfigured,
      isHealthy: geminiProviderStatus === 'Healthy',
      modelCount: geminiCatalogModels.length,
      models: geminiCatalogModels.map((model) => model.model),
      updatedAt: geminiAvailabilityQuery.dataUpdatedAt,
      error: geminiAvailability?.error ?? null,
      isChecking: geminiAvailabilityQuery.isFetching,
      onRefresh: () => void geminiAvailabilityQuery.refetch(),
    },
    {
      id: 'ollama',
      name: 'Ollama',
      description: 'Self-hosted provider',
      endpoint: effectiveOllamaBaseUrl,
      status: ollamaProviderStatus,
      tone: ollamaProviderTone,
      isConfigured: effectiveOllamaBaseUrl.trim().length > 0,
      isHealthy: isOllamaProviderHealthy,
      modelCount: availableOllamaModels.length,
      models: availableOllamaModels.map((model) => model.model),
      updatedAt: ollamaAvailabilityQuery.dataUpdatedAt,
      error: ollamaAvailability?.error ?? null,
      isChecking: ollamaAvailabilityQuery.isFetching,
      onRefresh: () => void ollamaAvailabilityQuery.refetch(),
    },
  ];
  const aiSetupStatus = getAiSetupStatus({
    aiEnabled: aiDraft.aiFeaturesEnabled,
    providers: providerSummaries,
    selectedSearchEngine,
    searchEngineCount: selectableEmbeddingModelOptions.length,
  });
  const visibleProviderSummaries = providerSummaries.filter((provider) => provider.isConfigured);
  const isAiReady = aiSetupStatus.state === 'ready' || aiSetupStatus.state === 'enabled';
  const isInitialGeminiDiscoveryPending =
    geminiAvailabilityQuery.isLoading ||
    (geminiAvailabilityQuery.isFetching && geminiAvailabilityQuery.data === undefined);
  const isInitialOllamaDiscoveryPending =
    ollamaAvailabilityQuery.isLoading ||
    (ollamaAvailabilityQuery.isFetching && ollamaAvailabilityQuery.data === undefined);
  const isAiConfigurationLoading =
    aiSettingsQuery.isLoading ||
    aiStatusQuery.isLoading ||
    aiModelCatalogQuery.isLoading ||
    isInitialGeminiDiscoveryPending ||
    isInitialOllamaDiscoveryPending;

  useEffect(() => {
    const savedEmbeddingSelected =
      savedAiSettings.embedding.provider !== null &&
      savedAiSettings.embedding.model !== null &&
      savedAiSettings.embedding.dimensions !== null;
    const onlyEmbeddingOption =
      selectableEmbeddingModelOptions.length === 1 ? selectableEmbeddingModelOptions[0] : null;

    if (
      isAiConfigurationLoading ||
      savedEmbeddingSelected ||
      onlyEmbeddingOption === null ||
      autoPromptedSearchEngineKey === onlyEmbeddingOption.key
    ) {
      return;
    }

    setSelectedEmbeddingModelKey(onlyEmbeddingOption.key);
    setAutoPromptedSearchEngineKey(onlyEmbeddingOption.key);
    setIsEmbeddingModelDialogOpen(true);
  }, [
    autoPromptedSearchEngineKey,
    isAiConfigurationLoading,
    savedAiSettings.embedding.dimensions,
    savedAiSettings.embedding.model,
    savedAiSettings.embedding.provider,
    selectableEmbeddingModelOptions,
  ]);

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

    merged.ollamaHost =
      merged.chat.provider === 'ollama'
        ? merged.chat.baseUrl
        : savedAiSettings.ollamaHost || merged.translation.baseUrl || merged.embedding.baseUrl;
    merged.model =
      merged.chat.provider === 'ollama'
        ? merged.chat.model
        : savedAiSettings.model || merged.translation.model;
    merged.translation.baseUrl =
      merged.translation.baseUrl || merged.ollamaHost || merged.embedding.baseUrl;
    return merged;
  }

  function normalizeAiSettingsForSave(settings: AdminAiSettings): AdminAiSettings {
    const configuredModel = parseChatModelValue({
      value: settings.chat.model.trim(),
      fallbackProvider: settings.chat.provider,
    });
    const chatSelection = configuredModel;
    const ollamaBaseUrl = (
      chatSelection.provider === 'ollama' && settings.chat.baseUrl.trim().length > 0
        ? settings.chat.baseUrl
        : settings.ollamaHost || savedAiSettings.ollamaHost || settings.embedding.baseUrl
    ).trim();
    const chatBaseUrl = chatSelection.provider === 'gemini' ? geminiBaseUrl : ollamaBaseUrl;
    const translationBaseUrl = (settings.translation.baseUrl || ollamaBaseUrl).trim();
    const configuredTranslation = settings.translation.model.trim();
    const translationModel = configuredTranslation;
    const hasEmbeddingSelection =
      settings.embedding.provider !== null &&
      (settings.embedding.model?.trim().length ?? 0) > 0 &&
      (settings.embedding.dimensions ?? 0) > 0;
    const embeddingBaseUrl = hasEmbeddingSelection
      ? settings.embedding.baseUrl.trim() || ollamaBaseUrl
      : '';
    const embeddingModel = hasEmbeddingSelection ? settings.embedding.model!.trim() : null;
    const embeddingDimensions = hasEmbeddingSelection ? settings.embedding.dimensions! : null;

    return {
      ...settings,
      aiFeaturesEnabled: settings.aiFeaturesEnabled && hasEmbeddingSelection,
      chat: {
        ...settings.chat,
        provider: chatSelection.provider,
        baseUrl: chatBaseUrl,
        apiKeySecretRef:
          chatSelection.provider === 'gemini'
            ? (settings.chat.apiKeySecretRef ?? settings.providers?.gemini?.apiKeySecretRef ?? null)
            : null,
        model: chatSelection.model,
        allowedModels: (settings.chat.allowedModels ?? effectiveAllowedChatModels).filter(
          (model) => model.trim().length > 0,
        ),
      },
      translation: {
        ...settings.translation,
        baseUrl: translationBaseUrl,
        model: translationModel,
      },
      embedding: {
        ...settings.embedding,
        provider: hasEmbeddingSelection ? settings.embedding.provider : null,
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
      model: chatSelection.provider === 'ollama' ? chatSelection.model : translationModel,
    };
  }

  const aiSettingsMutation = useMutation({
    mutationFn: (settings: AdminAiSettings) =>
      updateAdminAiSettings(normalizeAiSettingsForSave(settings)),
    onSuccess: async ({ settings }) => {
      toast.success('AI settings saved.');
      setAiDraftOverride({});
      queryClient.setQueryData<{ settings: AdminAiSettings } | undefined>(
        adminQueryKeys.aiSettings(),
        { settings },
      );
      queryClient.setQueryData<MeResponse | undefined>(meQueryKeys.all, (current) =>
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
      setAiDraftOverride({});
      toast.error(error instanceof Error ? error.message : 'Could not save AI settings.');
    },
  });

  function persistAiDraft(
    next: AiSettingsDraftOverride,
    options: { confirmEmbeddingChange?: boolean } = {},
  ) {
    const merged = mergeAiDraft(next);
    const nextEmbeddingConfigChanged =
      savedAiSettings.embedding.provider !== merged.embedding.provider ||
      savedAiSettings.embedding.baseUrl !== merged.embedding.baseUrl ||
      savedAiSettings.embedding.model !== merged.embedding.model ||
      savedAiSettings.embedding.dimensions !== merged.embedding.dimensions;

    if (merged.aiFeaturesEnabled && !isAiReady) {
      toast.warning('Choose available models from healthy providers before saving AI settings.');
      return;
    }

    if (options.confirmEmbeddingChange && nextEmbeddingConfigChanged) {
      const nextOption = embeddingModelOptions.find(
        (option) =>
          option.isInCatalog &&
          option.provider === merged.embedding.provider &&
          option.baseUrl === merged.embedding.baseUrl &&
          merged.embedding.model !== null &&
          option.model === merged.embedding.model,
      );
      setSelectedEmbeddingModelKey(nextOption?.key ?? '');
      setIsEmbeddingModelDialogOpen(true);
      return;
    }

    aiSettingsMutation.mutate(merged);
  }

  function openChatModelsDialog() {
    const defaultModel =
      effectiveDefaultChatModel || (chatModelOptions.length === 1 ? chatModelOptions[0]!.value : '');
    const allowed =
      effectiveAllowedChatModels.length > 0
        ? effectiveAllowedChatModels
        : defaultModel
          ? [defaultModel]
          : [];

    setDraftDefaultChatModel(defaultModel);
    setDraftAllowedChatModels(
      chatModelValues.filter((model) => allowed.includes(model) || model === defaultModel),
    );
    setIsChatModelsDialogOpen(true);
  }

  function openSearchEngineDialog() {
    const savedEmbeddingModel = savedAiSettings.embedding.model;
    const currentOption =
      savedEmbeddingModel === null
        ? (selectableEmbeddingModelOptions[0] ?? embeddingModelOptions[0])
        : embeddingModelOptions.find(
            (option) =>
              option.isInCatalog &&
              option.provider === savedAiSettings.embedding.provider &&
              option.baseUrl === savedAiSettings.embedding.baseUrl &&
              isSameOllamaModel(option.model, savedEmbeddingModel),
          ) ?? selectableEmbeddingModelOptions[0] ?? embeddingModelOptions[0];

    setSelectedEmbeddingModelKey(currentOption?.key ?? '');
    setIsEmbeddingModelDialogOpen(true);
  }

  function openTranslationModelDialog() {
    setSelectedTranslationModelKey(
      effectiveTranslationOption?.key ??
        (translationModelOptions.length === 1 ? translationModelOptions[0]!.key : ''),
    );
    setIsTranslationModelDialogOpen(true);
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

      return chatModelValues.filter((option) => next.has(option));
    });
  }

  function updateDraftDefaultChatModel(model: string) {
    setDraftDefaultChatModel(model);
    setDraftAllowedChatModels((current) =>
      chatModelValues.filter((option) => current.includes(option) || option === model),
    );
  }

  function saveChatModelsDialog() {
    if (draftDefaultChatModel.length === 0) {
      return;
    }

    const allowed = chatModelValues.filter(
      (model) => draftAllowedChatModels.includes(model) || model === draftDefaultChatModel,
    );
    const defaultSelection = parseChatModelValue({
      value: draftDefaultChatModel,
      fallbackProvider: aiDraft.chat.provider,
    });
    const defaultOption = chatModelOptions.find((option) => option.value === draftDefaultChatModel);
    setIsChatModelsDialogOpen(false);
    persistAiDraft({
      chat: {
        provider: defaultSelection.provider,
        baseUrl: defaultOption?.baseUrl ?? aiDraft.chat.baseUrl,
        model: defaultSelection.model,
        allowedModels: allowed,
        apiKeySecretRef:
          defaultSelection.provider === 'gemini'
            ? (aiDraft.providers?.gemini?.apiKeySecretRef ?? aiDraft.chat.apiKeySecretRef)
            : null,
      },
    });
  }

  return (
    <AdminAccessBoundary
      title="AI settings"
      description="Configure AI features for this Arkivra instance."
      actions={
        <chakra.a
          href="https://docs.arkivra.app"
          target="_blank"
          rel="noreferrer"
          display="inline-flex"
          alignItems="center"
          gap="1.5"
          rounded="md"
          px="2.5"
          py="1.5"
          textStyle="sm"
          fontWeight="medium"
          color="blue.solid"
          _hover={{ bg: 'bg.subtle', textDecoration: 'none' }}
        >
          View documentation
          <ExternalLink size={14} />
        </chakra.a>
      }
      isEnabled={isEnabled}
      isLoading={meQuery.isLoading}
    >
      <Stack gap="3">
        {isAiConfigurationLoading ? (
          <AiConfigurationLoadingState />
        ) : (
          <>
            {aiSetupStatus.state !== 'no_providers' ? (
              <AiStateHero
                state={aiSetupStatus.state}
                healthyProviderCount={aiSetupStatus.healthyProviders}
                isSaving={aiSettingsMutation.isPending}
                onChooseSearchEngine={openSearchEngineDialog}
                onDisableAi={() => persistAiDraft({ aiFeaturesEnabled: false })}
                onEnableAi={() => {
                  if (!isAiReady) {
                    toast.warning('Choose an embedding model before enabling AI.');
                    return;
                  }

                  persistAiDraft({ aiFeaturesEnabled: true });
                }}
                onToggleProviderDetails={() => setShowProviderDetails((current) => !current)}
              />
            ) : null}

            {aiSetupStatus.state === 'no_providers' ? (
              <AiUnconfiguredState />
            ) : (
              <>
                <AiCapabilitySection
                  state={aiSetupStatus.state}
                  chatModelCount={chatModelOptions.length}
                  defaultChatModel={
                    isChatConfigValid
                      ? (effectiveDefaultChatOption?.label ?? effectiveDefaultChatSelection.model)
                      : ''
                  }
                  effectiveTranslationModel={
                    isTranslationConfigValid && isTranslationModelMultimodal
                      ? effectiveTranslationModel
                      : ''
                  }
                  indexedChunks={indexedChunks}
                  indexProgress={indexProgress}
                  isChatConfigValid={isChatConfigValid}
                  isSaving={aiSettingsMutation.isPending}
                  isTranslationConfigValid={
                    isTranslationConfigValid && isTranslationModelMultimodal
                  }
                  searchEngineModel={aiSetupStatus.selectedSearchEngine?.model ?? ''}
                  searchEngineProvider={
                    aiSetupStatus.selectedSearchEngine?.provider ?? configuredEmbeddingProvider
                  }
                  semanticProgressStatus={semanticProgressStatus}
                  semanticStatus={semanticStatus}
                  totalChunks={chunkCoverage.totalChunkCount}
                  translationModelCount={translationModelOptions.length}
                  onConfigureChatModels={openChatModelsDialog}
                  onConfigureSearchEngine={openSearchEngineDialog}
                  onConfigureTranslation={openTranslationModelDialog}
                />

                <ProviderDetailsSection
                  expandedProvider={expandedProvider}
                  providers={visibleProviderSummaries}
                  showDetails={showProviderDetails}
                  onExpandedProviderChange={setExpandedProvider}
                  onToggleDetails={() => setShowProviderDetails((current) => !current)}
                />
              </>
            )}
          </>
        )}
      </Stack>

      <ChatModelsDialog
        open={isChatModelsDialogOpen}
        chatModelOptions={chatModelOptions}
        draftAllowedChatModels={draftAllowedChatModels}
        draftDefaultChatModel={draftDefaultChatModel}
        isFetchingChatModels={
          aiModelCatalogQuery.isFetching ||
          geminiAvailabilityQuery.isFetching ||
          ollamaAvailabilityQuery.isFetching
        }
        isSaving={aiSettingsMutation.isPending}
        onAllowedModelChange={updateDraftAllowedChatModel}
        onDefaultModelChange={updateDraftDefaultChatModel}
        onOpenChange={setIsChatModelsDialogOpen}
        onSave={saveChatModelsDialog}
      />

      <EmbeddingModelDialog
        open={isEmbeddingModelDialogOpen}
        aiDraft={aiDraft}
        embeddingModelOptions={embeddingModelOptions}
        selectedEmbeddingModel={selectedEmbeddingModel}
        selectedEmbeddingModelChanged={selectedEmbeddingModelChanged}
        selectedEmbeddingModelKey={selectedEmbeddingModelKey}
        isFetchingOllamaModels={
          aiModelCatalogQuery.isFetching || ollamaAvailabilityQuery.isFetching
        }
        isSaving={aiSettingsMutation.isPending}
        onConfirm={() => {
          if (selectedEmbeddingModel === null) return;

          setIsEmbeddingModelDialogOpen(false);
          aiSettingsMutation.mutate(
            mergeAiDraft({
              embedding: {
                provider: selectedEmbeddingModel.provider,
                baseUrl: selectedEmbeddingModel.baseUrl,
                model: selectedEmbeddingModel.model,
                dimensions: selectedEmbeddingModel.dimensions,
              },
            }),
          );
        }}
        onOpenChange={setIsEmbeddingModelDialogOpen}
        onSelectedModelKeyChange={setSelectedEmbeddingModelKey}
      />

      <TranslationModelDialog
        open={isTranslationModelDialogOpen}
        translationModelOptions={translationModelOptions}
        selectedTranslationModel={selectedTranslationModel}
        selectedTranslationModelChanged={selectedTranslationModelChanged}
        selectedTranslationModelKey={selectedTranslationModelKey}
        isFetchingModels={
          aiModelCatalogQuery.isFetching ||
          geminiAvailabilityQuery.isFetching ||
          ollamaAvailabilityQuery.isFetching
        }
        isSaving={aiSettingsMutation.isPending}
        onConfirm={() => {
          if (selectedTranslationModel === null) return;

          setIsTranslationModelDialogOpen(false);
          persistAiDraft({
            translation: {
              provider: selectedTranslationModel.provider,
              baseUrl: selectedTranslationModel.baseUrl,
              apiKeySecretRef:
                selectedTranslationModel.provider === 'gemini'
                  ? (aiDraft.providers?.gemini?.apiKeySecretRef ??
                    aiDraft.translation.apiKeySecretRef)
                  : null,
              model: selectedTranslationModel.model,
            },
          });
        }}
        onOpenChange={setIsTranslationModelDialogOpen}
        onSelectedModelKeyChange={setSelectedTranslationModelKey}
      />
    </AdminAccessBoundary>
  );
}

function AiConfigurationLoadingState() {
  return (
    <Card p={{ base: '5', lg: '6' }} shadow="xs">
      <Grid
        templateColumns={{ base: '1fr', lg: 'minmax(0, 1fr) 22rem' }}
        gap={{ base: '5', lg: '7' }}
        alignItems="center"
      >
        <Grid
          templateColumns={{ base: '1fr', md: '12rem minmax(0, 1fr)' }}
          gap={{ base: '4', md: '6' }}
          alignItems="center"
        >
          <Flex
            h="10rem"
            rounded="md"
            align="center"
            justify="center"
            bg="bg.subtle"
            borderWidth="1px"
            borderColor="border.surface"
            color="fg.muted"
            aria-hidden="true"
          >
            <RefreshCw size={48} />
          </Flex>
          <Stack gap="3">
            <Stack gap="1">
              <Text fontSize={{ base: 'xl', md: '2xl' }} fontWeight="semibold" color="fg">
                Checking AI configuration
              </Text>
              <Text textStyle="sm" color="fg.muted">
                Verifying providers and loading available models.
              </Text>
            </Stack>
            <Stack gap="2" color="fg.muted">
              <LoadingStep label="Verifying AI providers" />
              <LoadingStep label="Loading available models" />
              <LoadingStep label="Preparing AI settings" />
            </Stack>
          </Stack>
        </Grid>
        <Stack gap="3">
          <SkeletonLine w="11rem" />
          <SkeletonLine w="16rem" />
          <SkeletonLine w="13rem" />
        </Stack>
      </Grid>
    </Card>
  );
}

function LoadingStep({ label }: { label: string }) {
  return (
    <HStack gap="2">
      <Box boxSize="1.5" rounded="full" bg="blue.solid" />
      <Text textStyle="sm">{label}</Text>
    </HStack>
  );
}

function SkeletonLine({ w }: { w: string }) {
  return (
    <Box
      h="3"
      w={w}
      maxW="100%"
      rounded="full"
      bg="bg.subtle"
      borderWidth="1px"
      borderColor="border.surface"
    />
  );
}

function AiStateHero({
  healthyProviderCount,
  isSaving,
  onChooseSearchEngine,
  onDisableAi,
  onEnableAi,
  onToggleProviderDetails,
  state,
}: {
  state: AiSetupState;
  healthyProviderCount: number;
  isSaving: boolean;
  onChooseSearchEngine: () => void;
  onDisableAi: () => void;
  onEnableAi: () => void;
  onToggleProviderDetails: () => void;
}) {
  const content = getHeroContent(state);
  const hasProviders = state !== 'no_providers';
  const isEnabled = state === 'enabled';
  const providerSummary = `${healthyProviderCount.toLocaleString()} healthy provider${healthyProviderCount === 1 ? '' : 's'}`;

  return (
    <Card
      p={{ base: isEnabled ? '4' : '5', lg: isEnabled ? '5' : '6' }}
      shadow={isEnabled ? 'none' : 'xs'}
      borderColor={content.borderColor}
      bg={content.bg}
    >
      <Grid
        templateColumns={{ base: '1fr', lg: hasProviders ? 'minmax(0, 1fr) auto' : '1fr' }}
        gap={{ base: '4', lg: '6' }}
        alignItems="center"
      >
        <Grid
          templateColumns={{
            base: '1fr',
            md: isEnabled ? '8rem minmax(0, 1fr)' : '12rem minmax(0, 1fr)',
          }}
          gap={{ base: '4', md: isEnabled ? '4' : '6' }}
          alignItems="center"
        >
          <HeroVisual compact={isEnabled} state={state} />
          <Stack gap="3" minW="0">
            <HStack gap="3" flexWrap="wrap">
              <Text fontSize={{ base: 'xl', md: '2xl' }} fontWeight="semibold" color="fg">
                {content.title}
              </Text>
              <Badge colorPalette={content.badgePalette} variant="subtle">
                {content.badge}
              </Badge>
            </HStack>
            <Text textStyle="sm" color="fg.muted" maxW="42rem">
              {content.description}
            </Text>
            <HStack gap="2" flexWrap="wrap">
              {state === 'needs_search_engine' ? (
                <Button type="button" size="sm" onClick={onChooseSearchEngine}>
                  <Search size={16} />
                  Choose Embedding Model
                </Button>
              ) : null}
              {state === 'no_search_engines' ? (
                <Text textStyle="sm" fontWeight="medium" color="fg.muted">
                  No embedding models available
                </Text>
              ) : null}
              {state === 'ready' ? (
                <Button type="button" size="sm" disabled={isSaving} onClick={onEnableAi}>
                  <Play size={16} />
                  {isSaving ? 'Enabling...' : 'Enable AI'}
                </Button>
              ) : null}
              {state === 'enabled' ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={isSaving}
                  onClick={onDisableAi}
                >
                  <Settings size={16} />
                  {isSaving ? 'Saving...' : 'Disable AI'}
                </Button>
              ) : null}
            </HStack>
          </Stack>
        </Grid>

        {hasProviders ? (
          <Button
            type="button"
            variant="ghost"
            justifyContent={{ base: 'flex-start', lg: 'flex-end' }}
            alignSelf={{ base: 'stretch', lg: 'center' }}
            color="fg.muted"
            onClick={onToggleProviderDetails}
          >
            <HealthDot healthy={healthyProviderCount > 0} />
            {providerSummary}
            <ChevronRight size={16} />
          </Button>
        ) : null}
      </Grid>
    </Card>
  );
}

function AiUnconfiguredState() {
  return (
    <Card p={{ base: '6', md: '8', lg: '12' }} shadow="xs">
      <Stack
        gap={{ base: '6', md: '7' }}
        align="center"
        textAlign="center"
        minH="34rem"
        justify="center"
      >
        <chakra.img
          src={aiFeaturesIllustration}
          alt=""
          aria-hidden="true"
          w={{ base: '18rem', md: '24rem', lg: '29rem' }}
          maxW="100%"
          pointerEvents="none"
          userSelect="none"
        />

        <Stack gap="3" maxW="43rem">
          <Text fontSize={{ base: '3xl', md: '4xl' }} fontWeight="semibold" color="fg">
            AI is not configured
          </Text>
          <Text color="fg.muted" fontSize={{ base: 'md', md: 'lg' }} lineHeight="1.65">
            Arkivra works without AI. Configure a provider when you want features like AI search,
            document chat, and translation.
          </Text>
        </Stack>

        <Box
          rounded="md"
          borderWidth="1px"
          borderColor="blue.muted"
          bg="blue.subtle"
          px={{ base: '4', md: '5' }}
          py={{ base: '4', md: '5' }}
          maxW="42rem"
          w="full"
          textAlign="start"
        >
          <HStack align="flex-start" gap="3">
            <Box color="blue.solid" flexShrink={0} pt="0.5">
              <Info size={22} />
            </Box>
            <Stack gap="1">
              <Text textStyle="sm" fontWeight="semibold" color="fg">
                What you'll need
              </Text>
              <Text textStyle="sm" color="fg.muted">
                One supported AI provider configured on the server through environment variables.
              </Text>
            </Stack>
          </HStack>
        </Box>

        <Stack gap="4" align="center" w="full" maxW="42rem">
          <HStack gap="4" w="full" color="fg.muted">
            <Box h="1px" bg="border.surface" flex="1" />
            <Text textStyle="sm" fontWeight="medium" whiteSpace="nowrap">
              Supported providers
            </Text>
            <Box h="1px" bg="border.surface" flex="1" />
          </HStack>
          <HStack gap="3" flexWrap="wrap" justify="center">
            <ProviderChip icon={<Bot size={20} />} label="Ollama" />
            <ProviderChip icon={<Sparkles size={22} />} label="Google Gemini" color="blue.solid" />
          </HStack>
        </Stack>

        <chakra.a
          href="https://docs.arkivra.app"
          target="_blank"
          rel="noreferrer"
          display="inline-flex"
          alignItems="center"
          gap="3"
          rounded="md"
          px="5"
          py="3"
          bg="blue.solid"
          color="blue.contrast"
          fontWeight="semibold"
          shadow="xs"
          _hover={{ bg: 'blue.emphasized', textDecoration: 'none' }}
        >
          <BookOpen size={18} />
          View setup guide
          <ExternalLink size={18} />
        </chakra.a>
      </Stack>
    </Card>
  );
}

function ProviderChip({
  color = 'fg',
  icon,
  label,
}: {
  color?: string;
  icon: ReactNode;
  label: string;
}) {
  return (
    <HStack
      gap="3"
      rounded="md"
      borderWidth="1px"
      borderColor="border.surface"
      bg="bg.surface"
      px="5"
      py="3"
      shadow="xs"
    >
      <Box color={color}>{icon}</Box>
      <Text textStyle="sm" fontWeight="semibold" color="fg">
        {label}
      </Text>
    </HStack>
  );
}

function AiCapabilitySection({
  chatModelCount,
  defaultChatModel,
  effectiveTranslationModel,
  indexedChunks,
  indexProgress,
  isChatConfigValid,
  isSaving,
  isTranslationConfigValid,
  onConfigureChatModels,
  onConfigureSearchEngine,
  onConfigureTranslation,
  searchEngineModel,
  searchEngineProvider,
  semanticProgressStatus,
  semanticStatus,
  state,
  totalChunks,
  translationModelCount,
}: {
  state: AiSetupState;
  chatModelCount: number;
  defaultChatModel: string;
  effectiveTranslationModel: string;
  indexedChunks: number;
  indexProgress: number;
  isChatConfigValid: boolean;
  isSaving: boolean;
  isTranslationConfigValid: boolean;
  searchEngineModel: string;
  searchEngineProvider: AdminAiSettings['embedding']['provider'];
  semanticProgressStatus: ChunkProgressVisualStatus;
  semanticStatus: string;
  totalChunks: number;
  translationModelCount: number;
  onConfigureChatModels: () => void;
  onConfigureSearchEngine: () => void;
  onConfigureTranslation: () => void;
}) {
  const isEnabled = state === 'enabled';
  const blocked = state === 'needs_search_engine' || state === 'no_search_engines';
  const previewOnly = state === 'ready';

  return (
    <Card p={{ base: '4', lg: '5' }} shadow="xs">
      <Stack gap="4">
        <Stack gap="0.5">
          <Text fontSize="lg" fontWeight="semibold" color="fg">
            {isEnabled ? 'AI Services' : 'AI Capabilities'}
          </Text>
          <Text textStyle="sm" color="fg.muted">
            {blocked
              ? 'These features require an embedding model to be selected.'
              : isEnabled
                ? 'Configure AI services for this instance.'
                : 'Enable AI to make these services available.'}
          </Text>
        </Stack>

        <SimpleGrid columns={{ base: 1, lg: 3 }} gap="3">
          <AiServiceCard
            title="AI Search"
            description="Find documents by meaning, not keywords."
            icon={<Search size={22} />}
            iconBg="green.subtle"
            iconColor="green.solid"
            status={blocked ? 'Unavailable' : isEnabled ? 'Enabled' : undefined}
            statusTone={blocked ? 'inactive' : 'enabled'}
            footer={
              blocked
                ? 'Requires an embedding model'
                : isEnabled
                  ? semanticStatus
                  : 'Will become available after AI is enabled.'
            }
            previewOnly={previewOnly}
            action={
              isEnabled ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={isSaving}
                  onClick={onConfigureSearchEngine}
                >
                  <Settings size={14} />
                  Configure
                </Button>
              ) : null
            }
          >
            {!blocked ? (
              <Stack gap="3">
                <ModelSummary
                  label="Embedding Model"
                  model={searchEngineModel || 'Not selected'}
                  provider={formatProvider(searchEngineProvider)}
                />
                {isEnabled ? (
                  <Stack gap="2">
                    <HStack justify="space-between" gap="3">
                      <Text textStyle="xs" color="fg.muted">
                        {indexedChunks.toLocaleString()} of {totalChunks.toLocaleString()} chunks
                        indexed
                      </Text>
                      <Text textStyle="xs" color="fg.muted">
                        {indexProgress}%
                      </Text>
                    </HStack>
                    <ChunkProgressBar progress={indexProgress} status={semanticProgressStatus} />
                  </Stack>
                ) : null}
              </Stack>
            ) : null}
          </AiServiceCard>

          <AiServiceCard
            title="AI Chat"
            description="Ask questions about your documents."
            icon={<MessageSquare size={22} />}
            iconBg="blue.subtle"
            iconColor="blue.solid"
            status={
              blocked
                ? 'Unavailable'
                : isEnabled
                  ? isChatConfigValid
                    ? 'Available'
                    : 'Needs configuration'
                  : undefined
            }
            statusTone={blocked ? 'inactive' : isChatConfigValid ? 'enabled' : 'warning'}
            footer={
              blocked
                ? 'Requires an embedding model'
                : isEnabled
                  ? `${chatModelCount.toLocaleString()} models available`
                  : 'Will become available after AI is enabled.'
            }
            previewOnly={previewOnly}
            action={
              isEnabled ? (
                <Button
                  type="button"
                  size="sm"
                  variant={isChatConfigValid ? 'outline' : 'solid'}
                  disabled={chatModelCount === 0 || isSaving}
                  onClick={onConfigureChatModels}
                >
                  Configure models
                </Button>
              ) : null
            }
          >
            {!blocked ? (
              <Stack gap="3">
                <ModelSummary
                  label="Default chat model"
                  model={defaultChatModel || 'Not selected'}
                  provider=""
                  detail={
                    isChatConfigValid
                      ? 'Uses the configured embedding model.'
                      : 'No default chat model selected.'
                  }
                />
              </Stack>
            ) : null}
          </AiServiceCard>

          <AiServiceCard
            title="Translation"
            description="Translate documents to multiple languages."
            icon={<Languages size={22} />}
            iconBg="purple.subtle"
            iconColor="purple.solid"
            status={
              blocked
                ? 'Unavailable'
                : isEnabled
                  ? isTranslationConfigValid
                    ? 'Available'
                    : 'Needs configuration'
                  : undefined
            }
            statusTone={blocked ? 'inactive' : isTranslationConfigValid ? 'enabled' : 'warning'}
            footer={
              blocked
                ? 'Requires AI to be enabled'
                : isEnabled
                  ? `${translationModelCount.toLocaleString()} models available`
                  : 'Will become available after AI is enabled.'
            }
            previewOnly={previewOnly}
            action={
              isEnabled ? (
                <Button
                  type="button"
                  size="sm"
                  variant={isTranslationConfigValid ? 'outline' : 'solid'}
                  disabled={translationModelCount === 0 || isSaving}
                  onClick={onConfigureTranslation}
                >
                  Configure model
                </Button>
              ) : null
            }
          >
            {!blocked ? (
              <ModelSummary
                label="Translation model"
                model={effectiveTranslationModel || 'Not selected'}
                provider=""
                detail={
                  isTranslationConfigValid
                    ? 'Vision / multimodal'
                    : 'No translation model selected.'
                }
              />
            ) : null}
          </AiServiceCard>
        </SimpleGrid>
      </Stack>
    </Card>
  );
}

function AiServiceCard({
  action,
  children,
  description,
  footer,
  icon,
  iconBg,
  iconColor,
  status,
  statusTone,
  title,
  previewOnly = false,
}: {
  title: string;
  description: string;
  icon: ReactNode;
  iconBg: string;
  iconColor: string;
  status?: string;
  statusTone: 'enabled' | 'inactive' | 'warning';
  footer: string;
  action?: ReactNode;
  children?: ReactNode;
  previewOnly?: boolean;
}) {
  return (
    <Stack
      gap="4"
      rounded="md"
      borderWidth="1px"
      borderColor={previewOnly ? 'border.muted' : 'border.surface'}
      bg={previewOnly ? 'bg.subtle' : 'bg.surface'}
      minH="17rem"
      p="4"
      justify="space-between"
      opacity={previewOnly ? 0.78 : 1}
    >
      <Stack gap="4">
        <HStack gap="3" justify="space-between" align="start">
          <HStack gap="3" minW="0" align="center">
            <Flex
              boxSize="11"
              rounded="md"
              bg={iconBg}
              color={iconColor}
              align="center"
              justify="center"
            >
              {icon}
            </Flex>
            <Text textStyle="sm" fontWeight="semibold" color="fg">
              {title}
            </Text>
          </HStack>
          {status ? (
            <Badge colorPalette={getStatusPalette(statusTone)} variant="subtle" flexShrink={0}>
              {status}
            </Badge>
          ) : null}
        </HStack>
        <Text textStyle="sm" color="fg.muted">
          {description}
        </Text>
        {children ? (
          <Box pt="2" borderTopWidth="1px" borderColor="border.surface">
            {children}
          </Box>
        ) : null}
      </Stack>
      <Flex
        gap="3"
        align="center"
        justify="space-between"
        borderTopWidth="1px"
        borderColor="border.surface"
        pt="3"
      >
        <HStack gap="2" minW="0" color={statusTone === 'enabled' ? 'fg.success' : 'fg.muted'}>
          {statusTone === 'enabled' && !previewOnly ? (
            <CheckCircle2 size={15} />
          ) : (
            <Info size={15} />
          )}
          <Text textStyle="xs" color="fg.muted" truncate>
            {footer}
          </Text>
        </HStack>
        {action ? <Box flexShrink={0}>{action}</Box> : null}
      </Flex>
    </Stack>
  );
}

function ModelSummary({
  detail,
  label,
  model,
  provider,
}: {
  label: string;
  model: string;
  provider: string;
  detail?: string;
}) {
  return (
    <Stack gap="1">
      <Text textStyle="xs" color="fg.muted">
        {label}
      </Text>
      <HStack gap="2" minW="0" flexWrap="wrap">
        <Package size={15} />
        <Text textStyle="sm" fontWeight="semibold" color="fg" wordBreak="break-word">
          {model}
        </Text>
        {provider ? (
          <Badge variant="subtle" colorPalette="blue">
            {provider}
          </Badge>
        ) : null}
      </HStack>
      {detail ? (
        <Text textStyle="xs" color="fg.muted">
          {detail}
        </Text>
      ) : null}
    </Stack>
  );
}

function ProviderDetailsSection({
  expandedProvider,
  onExpandedProviderChange,
  onToggleDetails,
  providers,
  showDetails,
}: {
  providers: AiProviderSummary[];
  showDetails: boolean;
  expandedProvider: 'ollama' | 'gemini' | null;
  onToggleDetails: () => void;
  onExpandedProviderChange: (provider: 'ollama' | 'gemini' | null) => void;
}) {
  const healthyCount = providers.filter((provider) => provider.isHealthy).length;

  return (
    <Card p="0" shadow="xs" overflow="hidden">
      <Flex
        direction={{ base: 'column', md: 'row' }}
        justify="space-between"
        align={{ base: 'stretch', md: 'center' }}
        gap="3"
        p="4"
      >
        <Stack gap="0.5">
          <Text fontSize="md" fontWeight="semibold" color="fg">
            Providers
          </Text>
          <Text textStyle="sm" color="fg.muted">
            Providers are read-only and configured through environment variables.
          </Text>
        </Stack>
        <Button type="button" size="sm" variant="outline" onClick={onToggleDetails}>
          {showDetails ? 'Hide providers' : 'View providers'}
          <ChevronRight size={16} />
        </Button>
      </Flex>
      <Flex
        direction={{ base: 'column', md: 'row' }}
        align={{ base: 'stretch', md: 'center' }}
        justify="space-between"
        gap="3"
        borderTopWidth="1px"
        borderColor="border.surface"
        px="4"
        py="3"
      >
        <HStack gap="2">
          <HealthDot healthy={healthyCount > 0} />
          <Text textStyle="sm" color="fg.muted">
            {healthyCount.toLocaleString()} provider{healthyCount === 1 ? '' : 's'} healthy
          </Text>
        </HStack>
        <Text textStyle="sm" color="fg.muted">
          Last checked: {formatLastChecked(providers)}
        </Text>
      </Flex>
      {showDetails ? (
        <Stack gap="0" borderTopWidth="1px" borderColor="border.surface">
          {providers.map((provider) => (
            <ProviderDetail
              key={provider.id}
              expanded={expandedProvider === provider.id}
              provider={provider}
              onToggleExpanded={() =>
                onExpandedProviderChange(expandedProvider === provider.id ? null : provider.id)
              }
            />
          ))}
        </Stack>
      ) : null}
    </Card>
  );
}

function ProviderDetail({
  expanded,
  onToggleExpanded,
  provider,
}: {
  provider: AiProviderSummary;
  expanded: boolean;
  onToggleExpanded: () => void;
}) {
  return (
    <Box borderBottomWidth="1px" borderColor="border.surface" _last={{ borderBottomWidth: '0' }}>
      <Flex
        direction={{ base: 'column', lg: 'row' }}
        gap="3"
        align={{ base: 'stretch', lg: 'center' }}
        justify="space-between"
        px="4"
        py="3"
      >
        <HStack gap="3" minW="0">
          <Flex
            boxSize="9"
            rounded="md"
            align="center"
            justify="center"
            bg="bg.subtle"
            color="fg.muted"
          >
            {provider.id === 'gemini' ? <Sparkles size={18} /> : <Package size={18} />}
          </Flex>
          <Stack gap="0" minW="0">
            <HStack gap="2" flexWrap="wrap">
              <Text textStyle="sm" fontWeight="semibold" color="fg">
                {provider.name}
              </Text>
              <Badge colorPalette={getStatusPalette(provider.tone)} variant="subtle">
                {provider.status}
              </Badge>
            </HStack>
            <Text textStyle="xs" color="fg.muted">
              {provider.description}
            </Text>
          </Stack>
        </HStack>
        <HStack gap="4" flexWrap="wrap" justify={{ base: 'flex-start', lg: 'flex-end' }}>
          <Text textStyle="sm" color="fg.muted">
            {provider.modelCount.toLocaleString()} models available
          </Text>
          <Text textStyle="sm" color="fg.muted">
            {provider.updatedAt
              ? `Checked ${formatRelativeTime(provider.updatedAt)}`
              : 'Not checked'}
          </Text>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label={`Refresh ${provider.name} provider`}
            disabled={provider.isChecking}
            onClick={provider.onRefresh}
          >
            <RefreshCw size={16} />
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={onToggleExpanded}>
            {expanded ? 'Hide details' : 'View details'}
          </Button>
        </HStack>
      </Flex>
      {expanded ? (
        <Box bg="bg.subtle" px="4" py="3">
          <SimpleGrid columns={{ base: 1, lg: 2 }} gap="3">
            <DetailTile label="Connection status" value={provider.error ?? provider.status} />
            <DetailTile
              label="Endpoint"
              value={provider.endpoint || 'Configured on the server'}
              mono
            />
            <Box
              gridColumn={{ base: 'auto', lg: '1 / -1' }}
              rounded="md"
              borderWidth="1px"
              borderColor="border.surface"
              bg="bg.surface"
              p="3"
            >
              <Stack gap="2">
                <HStack justify="space-between">
                  <Text textStyle="sm" fontWeight="semibold" color="fg">
                    Available models
                  </Text>
                  <Badge variant="secondary">{provider.modelCount.toLocaleString()}</Badge>
                </HStack>
                {provider.models.length > 0 ? (
                  <Flex gap="2" wrap="wrap">
                    {provider.models.map((model) => (
                      <Badge key={model} variant="outline" colorPalette="gray" whiteSpace="normal">
                        {model}
                      </Badge>
                    ))}
                  </Flex>
                ) : (
                  <Text textStyle="sm" color="fg.muted">
                    No available models were returned by this provider.
                  </Text>
                )}
              </Stack>
            </Box>
          </SimpleGrid>
        </Box>
      ) : null}
    </Box>
  );
}

function DetailTile({
  label,
  mono = false,
  value,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <Stack
      gap="1"
      rounded="md"
      borderWidth="1px"
      borderColor="border.surface"
      bg="bg.surface"
      p="3"
      minW="0"
    >
      <Text textStyle="xs" color="fg.muted">
        {label}
      </Text>
      <Text
        textStyle="sm"
        color="fg"
        fontFamily={mono ? 'mono' : undefined}
        overflowWrap="anywhere"
      >
        {value}
      </Text>
    </Stack>
  );
}

function HeroVisual({ compact = false, state }: { state: AiSetupState; compact?: boolean }) {
  const isWarning = state === 'needs_search_engine' || state === 'no_search_engines';
  const colorPalette =
    state === 'enabled' ? 'green' : state === 'ready' ? 'blue' : isWarning ? 'orange' : 'gray';
  const color = `${colorPalette}.solid`;
  const bg = `${colorPalette}.subtle`;

  return (
    <Flex
      h={compact ? '7rem' : '10rem'}
      rounded="md"
      align="center"
      justify="center"
      bg={bg}
      color={color}
      borderWidth="1px"
      borderColor={`${colorPalette}.muted`}
      aria-hidden="true"
    >
      {state === 'needs_search_engine' || state === 'no_search_engines' ? (
        <TriangleAlert size={compact ? 44 : 64} />
      ) : state === 'no_providers' ? (
        <Package size={compact ? 44 : 64} />
      ) : (
        <CheckCircle2 size={compact ? 48 : 68} />
      )}
    </Flex>
  );
}

function HealthDot({ healthy }: { healthy: boolean }) {
  return (
    <Box boxSize="2" rounded="full" bg={healthy ? 'green.solid' : 'orange.solid'} flexShrink={0} />
  );
}

function getHeroContent(state: AiSetupState) {
  if (state === 'no_providers') {
    return {
      title: 'AI is not configured',
      badge: 'Optional',
      description:
        'Arkivra works without AI. Configure a provider when you want to add AI features.',
      badgePalette: 'gray',
      borderColor: 'border.surface',
      bg: 'bg.surface',
    };
  }

  if (state === 'needs_search_engine') {
    return {
      title: 'AI needs setup',
      badge: 'Needs setup',
      description: 'Choose an embedding model that powers AI search before enabling AI.',
      badgePalette: 'orange',
      borderColor: 'orange.muted',
      bg: 'orange.subtle',
    };
  }

  if (state === 'no_search_engines') {
    return {
      title: 'No embedding models available',
      badge: 'Needs setup',
      description: 'Connect a provider with an embedding model before enabling AI.',
      badgePalette: 'orange',
      borderColor: 'orange.muted',
      bg: 'orange.subtle',
    };
  }

  if (state === 'ready') {
    return {
      title: 'AI is ready',
      badge: 'Ready',
      description:
        'Setup is complete. Enable AI to start indexing your documents and make AI features available.',
      badgePalette: 'blue',
      borderColor: 'blue.muted',
      bg: 'blue.subtle',
    };
  }

  return {
    title: 'AI is enabled',
    badge: 'Enabled',
    description: 'AI is enabled. Configure the AI services below.',
    badgePalette: 'green',
    borderColor: 'green.muted',
    bg: 'green.subtle',
  };
}

function getStatusPalette(tone: 'enabled' | 'inactive' | 'warning') {
  if (tone === 'enabled') return 'green';
  if (tone === 'warning') return 'orange';
  return 'gray';
}

function formatRelativeTime(timestamp: number) {
  const elapsedMs = Date.now() - timestamp;
  const minutes = Math.max(1, Math.round(elapsedMs / 60_000));

  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;

  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function formatLastChecked(providers: AiProviderSummary[]) {
  const latest = Math.max(...providers.map((provider) => provider.updatedAt));

  if (!Number.isFinite(latest) || latest <= 0) return 'not checked';

  return formatRelativeTime(latest);
}
