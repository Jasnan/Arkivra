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
  useAdminAiSettingsQuery,
  useAdminAiStatusQuery,
  useAdminOllamaModelsQuery,
} from '@/features/admin/admin.queries';
import type { AdminAiSettings } from '@/features/admin/admin.types';
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
  curatedGeminiChatModels,
  geminiBaseUrl,
  hasModelCapability,
  isSameOllamaModel,
} from './admin-ai-settings-page-model-catalog';
import type { EmbeddingModelOption } from './admin-ai-settings-page-model-catalog';
import { emptyAiSettings } from './admin-ai-settings-page-state';
import type { AiSettingsDraftOverride } from './admin-ai-settings-page-state';
import {
  formatIndexStatus,
  getIndexProgress,
} from './admin-ai-settings-page-status-helpers';
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
  const canListGeminiChatModels = isEnabled;
  const geminiChatModelsQuery = useAdminOllamaModelsQuery({
    host: geminiBaseUrl,
    provider: 'gemini',
    enabled: canListGeminiChatModels,
  });
  const canListOllamaModels = isEnabled && effectiveOllamaBaseUrl.trim().length > 0;
  const ollamaModelsQuery = useAdminOllamaModelsQuery({
    host: effectiveOllamaBaseUrl,
    includeEmbeddingModels: true,
    provider: 'ollama',
    enabled: canListOllamaModels,
  });
  const availableGeminiChatModels = useMemo(
    () => geminiChatModelsQuery.data?.models ?? [],
    [geminiChatModelsQuery.data?.models],
  );
  const availableOllamaModels = useMemo(
    () => ollamaModelsQuery.data?.models ?? [],
    [ollamaModelsQuery.data?.models],
  );
  const availableOllamaModelNames = useMemo(
    () => availableOllamaModels.map((model) => model.name),
    [availableOllamaModels],
  );
  const chatModelOptions = useMemo<ChatModelOption[]>(() => {
    const geminiOptions = availableGeminiChatModels.map((model) => ({
      value: formatChatModelValue({ provider: 'gemini', model: model.name }),
      provider: 'gemini' as const,
      providerLabel: 'Gemini',
      model: model.name,
      label: model.name,
      baseUrl: geminiBaseUrl,
      description: model.description ?? null,
      capabilities: model.capabilities,
    }));
    const ollamaOptions = availableOllamaModels
      .filter((model) => !hasModelCapability(model, 'embedding'))
      .map((model) => ({
        value: formatChatModelValue({ provider: 'ollama', model: model.name }),
        provider: 'ollama' as const,
        providerLabel: 'Ollama',
        model: model.name,
        label: model.name,
        baseUrl: effectiveOllamaBaseUrl,
        description: model.description ?? null,
        capabilities: model.capabilities,
      }));

    return [...geminiOptions, ...ollamaOptions];
  }, [availableGeminiChatModels, availableOllamaModels, effectiveOllamaBaseUrl]);
  const chatModelValues = useMemo(
    () => chatModelOptions.map((option) => option.value),
    [chatModelOptions],
  );
  const translationModelOptions = useMemo<TranslationModelOption[]>(() => {
    const geminiOptions = availableGeminiChatModels.map((model) => ({
      key: formatChatModelValue({ provider: 'gemini', model: model.name }),
      provider: 'gemini' as const,
      providerLabel: 'Gemini',
      model: model.name,
      label: model.name,
      baseUrl: geminiBaseUrl,
      description: model.description ?? null,
      capabilities: model.capabilities,
      isConfigured:
        aiDraft.translation.provider === 'gemini' && aiDraft.translation.model === model.name,
    }));
    const ollamaOptions = availableOllamaModels
      .filter((model) => hasModelCapability(model, 'vision'))
      .map((model) => ({
        key: formatChatModelValue({ provider: 'ollama', model: model.name }),
        provider: 'ollama' as const,
        providerLabel: 'Ollama',
        model: model.name,
        label: model.name,
        baseUrl: effectiveOllamaBaseUrl,
        description: model.description ?? null,
        capabilities: model.capabilities,
        isConfigured:
          aiDraft.translation.provider === 'ollama' && aiDraft.translation.model === model.name,
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
    : (chatModelOptions[0]?.value ?? '');
  const effectiveDefaultChatSelection = parseChatModelValue({
    value: effectiveDefaultChatModel,
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
    translationModelOptions[0] ??
    null;
  const effectiveTranslationModel = effectiveTranslationOption?.model ?? '';
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
          (model) => savedAllowedChatModelValues.includes(model) || model === effectiveDefaultChatModel,
        );
  const geminiAvailabilityQuery = useAdminAiAvailabilityQuery({
    host: geminiBaseUrl,
    model: curatedGeminiChatModels[0],
    provider: 'gemini',
    enabled: isEnabled,
  });
  const geminiAvailability = geminiAvailabilityQuery.data?.availability;
  const isChatConfigValid =
    effectiveDefaultChatModel.length > 0 &&
    (effectiveDefaultChatSelection.provider === 'gemini' ||
      (effectiveDefaultChatOption?.baseUrl ?? '').trim().length > 0);
  const ollamaProviderStatus =
    effectiveOllamaBaseUrl.trim().length === 0
      ? 'Not Configured'
      : ollamaModelsQuery.isFetching
        ? 'Checking'
        : ollamaModelsQuery.isError
          ? 'Error'
          : (ollamaModelsQuery.data?.models.length ?? 0) > 0
            ? 'Healthy'
            : 'No models';
  const ollamaProviderTone =
    ollamaProviderStatus === 'Healthy'
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
    (effectiveTranslationOption?.baseUrl ?? (aiDraft.translation.baseUrl || aiDraft.chat.baseUrl)).trim().length > 0 &&
    effectiveTranslationModel.length > 0;
  const isTranslationModelMultimodal =
    effectiveTranslationModel.length > 0 &&
    (effectiveTranslationOption?.capabilities.includes('vision') ?? false);
  const selectedEmbeddingProviderModel =
    aiDraft.embedding.provider === 'ollama'
      ? availableOllamaModels.find((model) => isSameOllamaModel(model.name, aiDraft.embedding.model))
      : undefined;
  const isEmbeddingModelEmbeddingCapable =
    aiDraft.embedding.provider !== 'ollama' ||
    (selectedEmbeddingProviderModel !== undefined &&
      hasModelCapability(selectedEmbeddingProviderModel, 'embedding'));
  const isEmbeddingConfigValid =
    aiDraft.embedding.baseUrl.trim().length > 0 &&
    aiDraft.embedding.model.trim().length > 0 &&
    Number.isInteger(aiDraft.embedding.dimensions) &&
    aiDraft.embedding.dimensions > 0 &&
    isEmbeddingModelEmbeddingCapable;
  const hasConfiguredProvider =
    effectiveOllamaBaseUrl.trim().length > 0 || geminiProviderStatus === 'Healthy';
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
  const isSemanticIndexIncomplete =
    aiDraft.aiFeaturesEnabled &&
    indexProgress < 100 &&
    (currentIndex !== null || chunkCoverage.totalChunkCount > 0);
  const semanticStatus = !aiDraft.aiFeaturesEnabled
    ? 'Paused'
    : isSemanticIndexIncomplete
      ? 'Building'
      : currentIndex
        ? formatIndexStatus(currentIndex.status)
        : isEmbeddingConfigValid
          ? 'Ready to index'
          : 'Needs configuration';
  const semanticStatusMessage = aiDraft.aiFeaturesEnabled
    ? 'Indexing continues in the background. Search switches to a new index only after it is ready.'
    : 'Indexing is paused, but your progress is saved. When you enable AI again, indexing will automatically continue from where it left off.';
  const semanticProgressStatus: ChunkProgressVisualStatus = !aiDraft.aiFeaturesEnabled
    ? 'paused'
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
      dimensions: aiDraft.embedding.dimensions,
      discoveredModels: ollamaModelsQuery.data?.models ?? [],
      model: aiDraft.embedding.model,
      provider: aiDraft.embedding.provider,
      savedEmbedding: savedAiSettings.embedding,
    });
  }, [
    activeIndex,
    aiDraft.embedding.baseUrl,
    aiDraft.embedding.dimensions,
    aiDraft.embedding.model,
    aiDraft.embedding.provider,
    ollamaModelsQuery.data?.models,
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
      chatModelValues.length === 0 && configuredModel.model.length > 0
        ? configuredModel
        : configuredModel.model.length > 0 && chatModelValues.includes(configuredModel.value)
          ? configuredModel
          : fallbackDefault;
    const ollamaBaseUrl = (
      chatSelection.provider === 'ollama' && settings.chat.baseUrl.trim().length > 0
        ? settings.chat.baseUrl
        : settings.ollamaHost || savedAiSettings.ollamaHost || settings.embedding.baseUrl
    ).trim();
    const chatBaseUrl =
      chatSelection.provider === 'gemini' ? geminiBaseUrl : ollamaBaseUrl;
    const translationBaseUrl = (settings.translation.baseUrl || ollamaBaseUrl).trim();
    const configuredTranslation = settings.translation.model.trim();
    const configuredTranslationKey = configuredTranslation
      ? formatChatModelValue({
          provider: settings.translation.provider,
          model: configuredTranslation,
        })
      : '';
    const translationModel =
      configuredTranslation.length > 0 && translationModelKeys.includes(configuredTranslationKey)
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
        : curatedGeminiChatModels[0];
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
          effectiveDefaultChatModel={effectiveDefaultChatOption?.label ?? effectiveDefaultChatSelection.model}
          effectiveTranslationModel={effectiveTranslationModel}
          embeddingModelOptions={embeddingModelOptions}
          isSaving={aiSettingsMutation.isPending}
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
          geminiProviderStatus={geminiProviderStatus}
          geminiProviderTone={geminiProviderTone}
          isSaving={aiSettingsMutation.isPending}
          ollamaDataUpdatedAt={ollamaModelsQuery.dataUpdatedAt}
          ollamaIsFetching={ollamaModelsQuery.isFetching}
          ollamaModels={ollamaModelsQuery.data?.models ?? []}
          ollamaProviderStatus={ollamaProviderStatus}
          ollamaProviderTone={ollamaProviderTone}
          onExpandedProviderChange={setExpandedProvider}
          onTestGeminiConnection={() => void geminiAvailabilityQuery.refetch()}
          onTestOllamaConnection={() => void ollamaModelsQuery.refetch()}
          onUseGeminiForChat={() => persistAiDraft({ chat: getGeminiChatDraft() })}
          onUseOllamaForChat={() =>
            persistAiDraft({
              chat: {
                provider: 'ollama',
                baseUrl: effectiveOllamaBaseUrl,
                model: savedAiSettings.model || aiDraft.model || availableOllamaModelNames[0] || '',
                allowedModels:
                  savedAiSettings.model || aiDraft.model || availableOllamaModelNames[0]
                    ? [
                        formatChatModelValue({
                          provider: 'ollama',
                          model: savedAiSettings.model || aiDraft.model || availableOllamaModelNames[0],
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
          onViewDetails={() => {
            toast.info(semanticStatusMessage);
          }}
        />
      </Stack>

      <ChatModelsDialog
        open={isChatModelsDialogOpen}
        chatModelOptions={chatModelOptions}
        draftAllowedChatModels={draftAllowedChatModels}
        draftDefaultChatModel={draftDefaultChatModel}
        isFetchingChatModels={geminiChatModelsQuery.isFetching || ollamaModelsQuery.isFetching}
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
        isFetchingOllamaModels={ollamaModelsQuery.isFetching}
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
        isFetchingModels={geminiChatModelsQuery.isFetching || ollamaModelsQuery.isFetching}
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
                  ? (aiDraft.providers?.gemini?.apiKeySecretRef ?? aiDraft.translation.apiKeySecretRef)
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
