import { useMemo, useState } from 'react';
import { Stack, Text, chakra } from '@chakra-ui/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ExternalLink } from 'lucide-react';
import { useAccentColor } from '@/components/providers/accent-color-context';
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
import { AdminAccessBoundary } from './admin-shared';
import {
  ChatModelsDialog,
  EmbeddingModelDialog,
  TranslationModelDialog,
} from './admin-ai-settings-page-dialogs';
import type { TranslationModelOption } from './admin-ai-settings-page-dialogs';
import { AdminAiModelSections } from './admin-ai-settings-page-models';
import { AdminAiProviderSection } from './admin-ai-settings-page-providers';
import {
  AdminAiCapabilitiesSection,
  AdminAiPlatformSection,
  AdminAiSemanticSearchSection,
} from './admin-ai-settings-page-status';
import {
  buildEmbeddingModelOptions,
  geminiBaseUrl,
  hasModelCapability,
  isSameOllamaModel,
} from './admin-ai-settings-page-model-catalog';
import type { EmbeddingModelOption } from './admin-ai-settings-page-model-catalog';
import { emptyAiSettings } from './admin-ai-settings-page-state';
import type { AiSettingsDraftOverride } from './admin-ai-settings-page-state';
import { formatIndexStatus, getIndexProgress } from './admin-ai-settings-page-status-helpers';
import type { ChunkProgressVisualStatus } from './admin-ai-settings-page-sections';

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

    const catalogModel = catalogModels.find((model) =>
      model.provider === 'ollama' && isSameOllamaModel(model.model, liveModel.name),
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
  const { accentColor } = useAccentColor();
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
  const [isTranslationModelDialogOpen, setIsTranslationModelDialogOpen] = useState(false);
  const [selectedTranslationModelKey, setSelectedTranslationModelKey] = useState('');
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
  const firstOllamaChatModel =
    ollamaCatalogModels.find((model) => hasModelCapability(model, 'chat'))?.model ??
    (aiDraft.chat.provider === 'ollama' ? aiDraft.chat.model : aiDraft.model);
  const geminiAvailabilityQuery = useAdminAiAvailabilityQuery({
    host: geminiBaseUrl,
    model: firstGeminiChatModel,
    provider: 'gemini',
    enabled: isEnabled && firstGeminiChatModel.length > 0,
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
    () => buildAvailableOllamaModels({
      availability: ollamaAvailability,
      catalogModels: ollamaCatalogModels,
    }),
    [ollamaAvailability, ollamaCatalogModels],
  );
  const availableOllamaChatModelNames = useMemo(
    () =>
      availableOllamaModels
        .filter((model) => hasModelCapability(model, 'chat'))
        .map((model) => model.model),
    [availableOllamaModels],
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
  const effectiveDefaultChatModel = isConfiguredChatModelAvailable
    ? configuredChatModel
    : '';
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
      : null) ??
    null;
  const effectiveTranslationModel =
    effectiveTranslationOption?.model ?? configuredTranslationModel;
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
      ? chatModelValues
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
  const geminiProviderStatus = geminiAvailabilityQuery.isFetching
    ? 'Checking'
    : geminiAvailability?.modelAvailable
      ? 'Healthy'
      : 'Not configured';
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
    (
      (effectiveTranslationOption.provider === 'gemini' && isGeminiProviderHealthy) ||
      (effectiveTranslationOption.provider === 'ollama' && isConfiguredTranslationModelAvailable)
    );
  const isTranslationModelMultimodal =
    effectiveTranslationModel.length > 0 &&
    (effectiveTranslationOption?.capabilities.includes('vision') ?? false);
  const selectedEmbeddingProviderModel =
    aiDraft.embedding.provider === 'ollama'
      ? availableOllamaModels.find((model) =>
          model.provider === 'ollama' &&
          hasModelCapability(model, 'embedding') &&
          isSameOllamaModel(model.model, aiDraft.embedding.model),
        )
      : undefined;
  const isEmbeddingModelEmbeddingCapable =
    aiDraft.embedding.provider !== 'ollama' ||
    selectedEmbeddingProviderModel !== undefined;
  const isEmbeddingConfigValid =
    aiDraft.embedding.baseUrl.trim().length > 0 &&
    aiDraft.embedding.model.trim().length > 0 &&
    Number.isInteger(aiDraft.embedding.dimensions) &&
    aiDraft.embedding.dimensions > 0 &&
    isEmbeddingModelEmbeddingCapable &&
    isOllamaProviderReachable;
  const hasConfiguredProvider =
    isOllamaProviderHealthy || geminiProviderStatus === 'Healthy';
  const readinessChecks = [
    {
      label: 'At least one AI provider is configured',
      statusLabel: 'Configured',
      missingLabel: 'Missing',
      isMet: hasConfiguredProvider,
    },
    {
      label: 'An embedding model is selected',
      statusLabel: 'Completed',
      missingLabel: 'Missing',
      isMet: isEmbeddingConfigValid,
    },
    {
      label: 'A chat model is selected',
      statusLabel: 'Completed',
      missingLabel: 'Missing',
      isMet: isChatConfigValid,
    },
    {
      label: 'A translation model is selected',
      statusLabel: 'Completed',
      missingLabel: 'Missing',
      isMet: isTranslationConfigValid,
    },
    {
      label: 'Translation model is multimodal',
      statusLabel: 'Completed',
      missingLabel:
        effectiveTranslationModel.length > 0
          ? 'Selected translation model does not support image input.'
          : 'Missing',
      isMet: isTranslationModelMultimodal,
    },
  ];
  const isAiReady = readinessChecks.every((check) => check.isMet);
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
  const configuredEmbeddingModel = savedAiSettings.embedding.model || aiDraft.embedding.model;
  const configuredEmbeddingProvider =
    savedAiSettings.embedding.provider || aiDraft.embedding.provider;
  const configuredEmbeddingDimensions =
    savedAiSettings.embedding.dimensions || aiDraft.embedding.dimensions;
  const embeddingModelOptions = useMemo<EmbeddingModelOption[]>(() => {
    return buildEmbeddingModelOptions({
      activeIndex,
      baseUrl: aiDraft.embedding.baseUrl,
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
    savedAiSettings.embedding,
  ]);
  const selectedEmbeddingModel =
    embeddingModelOptions.find((option) => option.key === selectedEmbeddingModelKey) ?? null;
  const selectedEmbeddingModelChanged =
    selectedEmbeddingModel !== null &&
    (savedAiSettings.embedding.provider !== selectedEmbeddingModel.provider ||
      savedAiSettings.embedding.baseUrl !== selectedEmbeddingModel.baseUrl ||
      savedAiSettings.embedding.model !== selectedEmbeddingModel.model ||
      savedAiSettings.embedding.dimensions !== selectedEmbeddingModel.dimensions);
  const ollamaChatModelForProviderAction =
    [savedAiSettings.model, aiDraft.model, availableOllamaChatModelNames[0] ?? '']
      .find((model) => model.trim().length > 0 && availableOllamaChatModelNames.includes(model)) ?? '';

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
    const fallbackDefault = parseChatModelValue({
      value: effectiveDefaultChatModel.trim(),
      fallbackProvider: settings.chat.provider,
    });
    const chatSelection =
      configuredModel.model.length > 0
        ? configuredModel
        : fallbackDefault;
    const ollamaBaseUrl = (
      chatSelection.provider === 'ollama' && settings.chat.baseUrl.trim().length > 0
        ? settings.chat.baseUrl
        : settings.ollamaHost || savedAiSettings.ollamaHost || settings.embedding.baseUrl
    ).trim();
    const chatBaseUrl = chatSelection.provider === 'gemini' ? geminiBaseUrl : ollamaBaseUrl;
    const translationBaseUrl = (settings.translation.baseUrl || ollamaBaseUrl).trim();
    const configuredTranslation = settings.translation.model.trim();
    const translationModel =
      configuredTranslation.length > 0
        ? configuredTranslation
        : effectiveTranslationModel.trim() ||
          savedAiSettings.translation?.model ||
          emptyAiSettings.translation.model;
    const embeddingBaseUrl = settings.embedding.baseUrl.trim() || ollamaBaseUrl;
    const embeddingModel =
      settings.embedding.model.trim() ||
      savedAiSettings.embedding.model ||
      emptyAiSettings.embedding.model;
    const embeddingDimensions =
      settings.embedding.dimensions > 0
        ? settings.embedding.dimensions
        : savedAiSettings.embedding.dimensions || emptyAiSettings.embedding.dimensions;

    return {
      ...settings,
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
      setAiDraftOverride(settings);
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

    setAiDraftOverride(merged);

    if (merged.aiFeaturesEnabled && !isAiReady) {
      toast.warning('Choose available models from healthy providers before saving AI settings.');
      return;
    }

    if (options.confirmEmbeddingChange && nextEmbeddingConfigChanged) {
      const nextOption = embeddingModelOptions.find(
        (option) =>
          option.provider === merged.embedding.provider &&
          option.baseUrl === merged.embedding.baseUrl &&
          option.model === merged.embedding.model,
      );
      setSelectedEmbeddingModelKey(nextOption?.key ?? '');
      setIsEmbeddingModelDialogOpen(true);
      return;
    }

    aiSettingsMutation.mutate(merged);
  }

  function getGeminiChatDraft() {
    const model =
      aiDraft.chat.provider === 'gemini' && aiDraft.chat.model
        ? aiDraft.chat.model
        : firstGeminiChatModel;
    const allowedModels = aiDraft.chat.allowedModels ?? [];

    return {
      provider: 'gemini' as const,
      baseUrl: geminiBaseUrl,
      model,
      allowedModels:
        aiDraft.chat.provider === 'gemini' && allowedModels.length > 0
          ? allowedModels
          : [formatChatModelValue({ provider: 'gemini', model })],
      apiKeySecretRef: null,
    };
  }

  function openChatModelsDialog() {
    const defaultModel = effectiveDefaultChatModel || chatModelOptions[0]?.value || '';
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

  function openTranslationModelDialog() {
    setSelectedTranslationModelKey(
      effectiveTranslationOption?.key ?? translationModelOptions[0]?.key ?? '',
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
      description="Configure and manage AI capabilities in Arkivra."
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
        {aiSettingsQuery.isLoading ? (
          <Text textStyle="sm" color="fg.muted">
            Loading AI settings...
          </Text>
        ) : null}

        <AdminAiPlatformSection
          accentColor={accentColor}
          aiFeaturesEnabled={aiDraft.aiFeaturesEnabled}
          isAiReady={isAiReady}
          isSaving={aiSettingsMutation.isPending}
          readinessChecks={readinessChecks}
          onToggleAiFeatures={(checked) => {
            if (checked && !isAiReady) {
              toast.warning('Complete AI Platform requirements before enabling AI.');
              return;
            }

            persistAiDraft({ aiFeaturesEnabled: checked });
          }}
        />

        <AdminAiCapabilitiesSection
          accentColor={accentColor}
          aiFeaturesEnabled={aiDraft.aiFeaturesEnabled}
          chatEnabled={aiDraft.aiFeaturesEnabled && isChatConfigValid}
          isSaving={aiSettingsMutation.isPending}
          semanticEnabled={aiDraft.aiFeaturesEnabled && isEmbeddingConfigValid}
          translationEnabled={
            aiDraft.aiFeaturesEnabled && isTranslationConfigValid && isTranslationModelMultimodal
          }
          onToggleChat={(checked) => {
            if (checked && !aiDraft.aiFeaturesEnabled) {
              toast.warning('Enable the AI Platform before turning on AI Chat.');
              return;
            }
            toast.info('AI Chat follows the AI Platform setting in this release.');
          }}
          onToggleSemantic={(checked) => {
            if (checked && !aiDraft.aiFeaturesEnabled) {
              toast.warning('Enable the AI Platform before turning on Semantic Search.');
              return;
            }
            toast.info('Semantic Search follows the AI Platform setting in this release.');
          }}
          onToggleTranslation={(checked) => {
            if (checked && !aiDraft.aiFeaturesEnabled) {
              toast.warning('Enable the AI Platform before turning on Translation.');
              return;
            }
            toast.info('Translation follows the AI Platform setting in this release.');
          }}
        />

        <AdminAiModelSections
          aiDraft={aiDraft}
          chatModelOptions={chatModelValues}
          configuredEmbeddingDimensions={configuredEmbeddingDimensions}
          configuredEmbeddingModel={configuredEmbeddingModel}
          configuredEmbeddingProvider={configuredEmbeddingProvider}
          effectiveDefaultChatModel={
            effectiveDefaultChatOption?.label ?? effectiveDefaultChatSelection.model
          }
          effectiveTranslationModel={effectiveTranslationModel}
          embeddingModelOptions={embeddingModelOptions}
          isChatModelAvailable={isChatConfigValid}
          isEmbeddingModelAvailable={isEmbeddingConfigValid}
          isSaving={aiSettingsMutation.isPending}
          isTranslationModelAvailable={isTranslationConfigValid && isTranslationModelMultimodal}
          savedEmbedding={savedAiSettings.embedding}
          translationModelCount={translationModelOptions.length}
          onChangeEmbeddingModel={setSelectedEmbeddingModelKey}
          onConfigureChatModels={openChatModelsDialog}
          onOpenEmbeddingModelDialog={() => setIsEmbeddingModelDialogOpen(true)}
          onOpenTranslationModelDialog={openTranslationModelDialog}
        />

        <AdminAiProviderSection
          aiDraft={aiDraft}
          effectiveOllamaBaseUrl={effectiveOllamaBaseUrl}
          expandedProvider={expandedProvider}
          geminiAvailability={geminiAvailability}
          geminiDataUpdatedAt={geminiAvailabilityQuery.dataUpdatedAt}
          geminiModels={geminiCatalogModels}
          geminiProviderStatus={geminiProviderStatus}
          geminiProviderTone={geminiProviderTone}
          isSaving={aiSettingsMutation.isPending}
          ollamaAvailability={ollamaAvailability}
          ollamaDataUpdatedAt={ollamaAvailabilityQuery.dataUpdatedAt}
          ollamaIsFetching={ollamaAvailabilityQuery.isFetching}
          ollamaModels={availableOllamaModels}
          ollamaProviderStatus={ollamaProviderStatus}
          ollamaProviderTone={ollamaProviderTone}
          onExpandedProviderChange={setExpandedProvider}
          onTestGeminiConnection={() => void geminiAvailabilityQuery.refetch()}
          onTestOllamaConnection={() => void ollamaAvailabilityQuery.refetch()}
          onUseGeminiForChat={() => persistAiDraft({ chat: getGeminiChatDraft() })}
          onUseOllamaForChat={() =>
            persistAiDraft({
              chat: {
                provider: 'ollama',
                baseUrl: effectiveOllamaBaseUrl,
                model: ollamaChatModelForProviderAction,
                allowedModels:
                  ollamaChatModelForProviderAction.length > 0
                    ? [
                        formatChatModelValue({
                          provider: 'ollama',
                          model: ollamaChatModelForProviderAction,
                        }),
                      ]
                    : [],
                apiKeySecretRef: null,
              },
            })
          }
        />

        <AdminAiSemanticSearchSection
          chunkTotal={chunkCoverage.totalChunkCount}
          currentIndex={currentIndex}
          indexProgress={indexProgress}
          indexedChunks={indexedChunks}
          liveIndexModel={aiDraft.embedding.model || 'Not selected'}
          semanticProgressStatus={semanticProgressStatus}
          semanticStatus={semanticStatus}
        />
      </Stack>

      <ChatModelsDialog
        open={isChatModelsDialogOpen}
        chatModelOptions={chatModelOptions}
        draftAllowedChatModels={draftAllowedChatModels}
        draftDefaultChatModel={draftDefaultChatModel}
        isFetchingChatModels={aiModelCatalogQuery.isFetching || geminiAvailabilityQuery.isFetching || ollamaAvailabilityQuery.isFetching}
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
        isFetchingOllamaModels={aiModelCatalogQuery.isFetching || ollamaAvailabilityQuery.isFetching}
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
        isFetchingModels={aiModelCatalogQuery.isFetching || geminiAvailabilityQuery.isFetching || ollamaAvailabilityQuery.isFetching}
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
