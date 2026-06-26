import { useMemo, useState } from 'react';
import {
  Box,
  Flex,
  HStack,
  SimpleGrid,
  Stack,
  Text,
} from '@chakra-ui/react';
import type { ReactNode } from 'react';
import {
  CheckCircle2,
  Database,
  Info,
  Languages,
  Layers3,
  MessageCircle,
  Search,
  Server,
  Sparkles,
} from 'lucide-react';
import { useAccentColor } from '@/components/providers/accent-color-context';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import type { AdminAiSettings } from '@/features/admin/admin.types';
import type { EmbeddingModelOption } from './admin-ai-settings-page-provider-models';

interface ChatModelOption {
  value: string;
  provider: AdminAiSettings['chat']['provider'];
  providerLabel: string;
  model: string;
  label: string;
  baseUrl: string;
  description?: string | null;
  capabilities: string[];
}

export interface TranslationModelOption {
  key: string;
  provider: AdminAiSettings['translation']['provider'];
  providerLabel: string;
  model: string;
  label: string;
  baseUrl: string;
  description?: string | null;
  capabilities: string[];
  isConfigured: boolean;
}

const visibleChatModelCardCount = 5;
const chatModelCardMinH = '5rem';
const chatModelListMaxH = '31.5rem';
const chatModelPanelH = '38.5rem';

export function ChatModelsDialog({
  open,
  chatModelOptions,
  draftAllowedChatModels,
  draftDefaultChatModel,
  isFetchingChatModels,
  isSaving,
  onAllowedModelChange,
  onDefaultModelChange,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  chatModelOptions: ChatModelOption[];
  draftAllowedChatModels: string[];
  draftDefaultChatModel: string;
  isFetchingChatModels: boolean;
  isSaving: boolean;
  onAllowedModelChange: (model: string, checked: boolean) => void;
  onDefaultModelChange: (model: string) => void;
  onOpenChange: (open: boolean) => void;
  onSave: () => void;
}) {
  const { accentColor } = useAccentColor();
  const [searchQuery, setSearchQuery] = useState('');
  const [providerFilter, setProviderFilter] = useState('all');
  const [visibilityFilter, setVisibilityFilter] = useState('all');
  const allowedModelSet = useMemo(
    () => new Set(draftAllowedChatModels),
    [draftAllowedChatModels],
  );
  const providerOptions = useMemo(
    () =>
      Array.from(
        chatModelOptions.reduce((providers, option) => {
          providers.set(option.provider, option.providerLabel);
          return providers;
        }, new Map<ChatModelOption['provider'], string>()),
      ).sort((left, right) => left[1].localeCompare(right[1])),
    [chatModelOptions],
  );
  const filteredChatModelOptions = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();

    return chatModelOptions.filter((option) => {
      const matchesSearch =
        normalizedSearch.length === 0 ||
        option.model.toLowerCase().includes(normalizedSearch) ||
        option.providerLabel.toLowerCase().includes(normalizedSearch) ||
        option.baseUrl.toLowerCase().includes(normalizedSearch);
      const matchesProvider = providerFilter === 'all' || option.provider === providerFilter;

      return matchesSearch && matchesProvider;
    });
  }, [chatModelOptions, providerFilter, searchQuery]);
  const enabledModelOptions = filteredChatModelOptions.filter((option) =>
    allowedModelSet.has(option.value),
  );
  const allEnabledModelOptions = chatModelOptions.filter((option) =>
    allowedModelSet.has(option.value),
  );
  const availableModelOptions =
    visibilityFilter === 'enabled'
      ? []
      : filteredChatModelOptions.filter((option) => !allowedModelSet.has(option.value));
  const isDefaultEnabled =
    draftDefaultChatModel.length > 0 && allowedModelSet.has(draftDefaultChatModel);
  const isEmpty = chatModelOptions.length === 0;
  const hasFilteredResults = enabledModelOptions.length > 0 || availableModelOptions.length > 0;
  const saveDisabled = !isDefaultEnabled || isSaving;

  function handleEnable(option: ChatModelOption) {
    onAllowedModelChange(option.value, true);
  }

  function handleDisable(option: ChatModelOption) {
    if (option.value === draftDefaultChatModel) {
      return;
    }

    onAllowedModelChange(option.value, false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent maxW="96rem" w="calc(100vw - 2rem)" maxH="calc(100vh - 2rem)">
        <DialogHeader px={{ base: '5', md: '7' }} pt="6" pb="4">
          <HStack gap="3" align="center" pe="10">
            <Box color={`${accentColor}.solid`} flexShrink={0}>
              <MessageCircle size={24} />
            </Box>
            <DialogTitle>Configure Chat Models</DialogTitle>
          </HStack>
          <DialogDescription>
            Choose which chat models users can access in chat and select the default for new conversations.
          </DialogDescription>
        </DialogHeader>
        <DialogBody px={{ base: '5', md: '7' }} pb="5" overflowY="auto">
          <Stack gap="5">
            <SimpleGrid columns={{ base: 1, md: 3 }} gap="5" alignItems="end">
              <Stack gap="1.5">
                <Text textStyle="xs" fontWeight="semibold" color="fg.muted">
                  Search
                </Text>
                <Box position="relative">
                  <Box
                    position="absolute"
                    insetStart="3"
                    top="50%"
                    transform="translateY(-50%)"
                    color="fg.muted"
                    pointerEvents="none"
                  >
                    <Search size={16} />
                  </Box>
                  <Input
                    aria-label="Search chat models"
                    value={searchQuery}
                    ps="9"
                    h="12"
                    bg="bg.surface"
                    placeholder="Search models..."
                    onChange={(event) => setSearchQuery(event.currentTarget.value)}
                  />
                </Box>
              </Stack>
              <Stack gap="1.5">
                <Text textStyle="xs" fontWeight="semibold" color="fg.muted">
                  Provider
                </Text>
                <Select
                  value={providerFilter}
                  onValueChange={setProviderFilter}
                  positioning={{ sameWidth: true }}
                >
                  <SelectTrigger aria-label="Provider filter" bg="bg.surface">
                    <SelectValue placeholder="All Providers" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Providers</SelectItem>
                    {providerOptions.map(([provider, label]) => (
                      <SelectItem key={provider} value={provider}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Stack>
              <Stack gap="1.5">
                <Text textStyle="xs" fontWeight="semibold" color="fg.muted">
                  Show
                </Text>
                <Select
                  value={visibilityFilter}
                  onValueChange={setVisibilityFilter}
                  positioning={{ sameWidth: true }}
                >
                  <SelectTrigger aria-label="Model visibility filter" bg="bg.surface">
                    <SelectValue placeholder="All models" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All models</SelectItem>
                    <SelectItem value="enabled">Enabled only</SelectItem>
                  </SelectContent>
                </Select>
              </Stack>
            </SimpleGrid>

            {isEmpty ? (
              <EmptyChatModelState
                message={
                  isFetchingChatModels
                    ? 'Loading available models and provider status...'
                    : 'No chat models are selectable from healthy providers.'
                }
              />
            ) : !hasFilteredResults ? (
              <EmptyChatModelState message="No models match the current filters." />
            ) : (
              <SimpleGrid columns={{ base: 1, xl: 2 }} gap="5" alignItems="start">
                <ChatModelPanel
                  title={`Available Models (${availableModelOptions.length.toLocaleString()})`}
                  description="Enable more models to make them available to users."
                >
                  {availableModelOptions.length > 0 ? (
                    <ChatModelList
                      shouldScroll={availableModelOptions.length > visibleChatModelCardCount}
                      maxH={chatModelListMaxH}
                    >
                      <Stack gap="2">
                        {availableModelOptions.map((option) => (
                          <ChatModelCard
                            key={option.value}
                            accentColor={accentColor}
                            option={option}
                            variant="available"
                            onEnable={() => handleEnable(option)}
                          />
                        ))}
                      </Stack>
                    </ChatModelList>
                  ) : (
                    <EmptyChatModelState
                      message={
                        visibilityFilter === 'enabled'
                          ? 'Enabled-only filtering is active.'
                          : 'Every matching model is already enabled.'
                      }
                    />
                  )}
                </ChatModelPanel>

                <ChatModelPanel
                  title={`Enabled Models (${enabledModelOptions.length.toLocaleString()})`}
                  description="Users can choose from these models in chat."
                  tone="enabled"
                  headerActions={
                    <DefaultChatModelSelect
                      enabledModelOptions={allEnabledModelOptions}
                      value={draftDefaultChatModel}
                      onChange={onDefaultModelChange}
                    />
                  }
                >
                  {enabledModelOptions.length > 0 ? (
                    <ChatModelList
                      shouldScroll={enabledModelOptions.length > visibleChatModelCardCount}
                      maxH={chatModelListMaxH}
                    >
                      <Stack gap="3">
                        {enabledModelOptions.map((option) => (
                          <ChatModelCard
                            key={option.value}
                            accentColor={accentColor}
                            option={option}
                            isDefault={option.value === draftDefaultChatModel}
                            variant="enabled"
                            onDefault={() => onDefaultModelChange(option.value)}
                            onDisable={() => handleDisable(option)}
                          />
                        ))}
                      </Stack>
                    </ChatModelList>
                  ) : (
                    <EmptyChatModelState message="No enabled models match the current filters." />
                  )}
                  <ChatModelInfoNotice />
                </ChatModelPanel>
              </SimpleGrid>
            )}
          </Stack>
        </DialogBody>
        <DialogFooter
          px={{ base: '5', md: '7' }}
          py="4"
          borderTopWidth="1px"
          borderColor="border.surface"
        >
          <HStack gap="2" me="auto" color={isDefaultEnabled ? 'fg.muted' : 'orange.fg'}>
            <CheckCircle2 size={16} />
            <Text textStyle="sm">
              {draftAllowedChatModels.length.toLocaleString()} models enabled
              {isDefaultEnabled
                ? ` · Default: ${getChatModelLabel(chatModelOptions, draftDefaultChatModel)}`
                : ' · select an enabled default model'}
            </Text>
          </HStack>
          <Button type="button" size="sm" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" size="sm" disabled={saveDisabled} onClick={onSave}>
            {isSaving ? 'Saving...' : 'Save chat models'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ChatModelPanel({
  children,
  description,
  headerActions,
  title,
  tone,
}: {
  children: ReactNode;
  description: string;
  headerActions?: ReactNode;
  title: string;
  tone?: 'enabled';
}) {
  return (
    <Stack
      gap="3"
      h={{ base: 'auto', xl: chatModelPanelH }}
      rounded="md"
      borderWidth="1px"
      borderColor={tone === 'enabled' ? 'blue.muted' : 'border.surface'}
      bg={tone === 'enabled' ? 'blue.subtle' : 'bg.subtle'}
      p={{ base: '3', md: '4' }}
    >
      <Flex gap="3" align={{ base: 'stretch', md: 'start' }} direction={{ base: 'column', md: 'row' }}>
        <Stack gap="1" minW="0" flex="1">
          <Text textStyle="md" fontWeight="semibold" color={tone === 'enabled' ? 'blue.fg' : 'fg'}>
            {title}
          </Text>
          <Text textStyle="sm" color="fg.muted">
            {description}
          </Text>
        </Stack>
        {headerActions ? (
          <Box flexShrink={0} w={{ base: 'full', md: '18rem' }}>
            {headerActions}
          </Box>
        ) : null}
      </Flex>
      {children}
    </Stack>
  );
}

function ChatModelList({
  children,
  maxH,
  shouldScroll,
}: {
  children: ReactNode;
  maxH: string;
  shouldScroll: boolean;
}) {
  return (
    <Box
      h={shouldScroll ? maxH : undefined}
      maxH={shouldScroll ? maxH : undefined}
      minH="0"
      overflowY={shouldScroll ? 'scroll' : 'visible'}
      pe={shouldScroll ? '1' : undefined}
      css={shouldScroll ? { scrollbarGutter: 'stable' } : undefined}
    >
      {children}
    </Box>
  );
}

function ChatModelCard({
  accentColor,
  isDefault = false,
  onDisable,
  onEnable,
  onDefault,
  option,
  variant,
}: {
  accentColor: string;
  isDefault?: boolean;
  onDisable?: () => void;
  onEnable?: () => void;
  onDefault?: () => void;
  option: ChatModelOption;
  variant: 'available' | 'enabled';
}) {
  return (
    <Box
      rounded="lg"
      borderWidth="1px"
      borderColor={isDefault ? `${accentColor}.muted` : 'border.surface'}
      bg="bg.surface"
      minH={chatModelCardMinH}
      display="flex"
      alignItems="center"
      px={{ base: '3', md: '4' }}
      py="3"
      shadow={isDefault ? 'sm' : 'xs'}
    >
      <Flex
        align={{ base: 'stretch', sm: 'center' }}
        direction={{ base: 'column', sm: 'row' }}
        gap="3"
        w="full"
      >
        <Stack gap="0.5" minW="0" flex="1">
          <Text textStyle="sm" fontWeight="semibold" color="fg" wordBreak="break-word">
            {option.label}
          </Text>
          <Text textStyle="sm" color="fg.muted">
            {option.providerLabel}
          </Text>
        </Stack>
        {variant === 'available' ? (
          <Button type="button" size="sm" variant="outline" flexShrink={0} onClick={onEnable}>
            Enable
          </Button>
        ) : null}
        {variant === 'enabled' ? (
          <HStack gap="3" flexShrink={0} justify={{ base: 'flex-end', sm: 'start' }}>
            {isDefault ? (
              <Badge colorPalette="green" variant="subtle" px="3" py="1.5">
                <CheckCircle2 size={14} />
                Default
              </Badge>
            ) : (
              <Button type="button" size="sm" variant="outline" onClick={onDefault}>
                Set as default
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={isDefault}
              onClick={onDisable}
            >
              Disable
            </Button>
          </HStack>
        ) : null}
      </Flex>
    </Box>
  );
}

function DefaultChatModelSelect({
  enabledModelOptions,
  onChange,
  value,
}: {
  enabledModelOptions: ChatModelOption[];
  onChange: (model: string) => void;
  value: string;
}) {
  const isDisabled = enabledModelOptions.length === 0;

  return (
    <Stack gap="1.5">
      <HStack gap="1.5" justify="flex-end" color="fg.muted">
        <Text textStyle="xs" fontWeight="medium">
          Default model
        </Text>
        <Info size={14} />
      </HStack>
      <Select
        value={value}
        disabled={isDisabled}
        onValueChange={(nextValue) => {
          if (nextValue.length > 0) {
            onChange(nextValue);
          }
        }}
        positioning={{ sameWidth: true }}
      >
        <SelectTrigger aria-label="Default chat model" bg="bg.surface">
          <SelectValue placeholder="Select model" />
        </SelectTrigger>
        <SelectContent>
          {enabledModelOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Stack>
  );
}

function ChatModelInfoNotice() {
  return (
    <HStack
      gap="3"
      align="center"
      rounded="md"
      borderWidth="1px"
      borderColor="blue.muted"
      bg="bg.surface"
      px={{ base: '3', md: '4' }}
      py="4"
      mt="auto"
      color="fg.muted"
    >
      <Box color="blue.fg" flexShrink={0}>
        <Info size={24} />
      </Box>
      <Stack gap="1">
        <Text textStyle="sm">Users will be able to choose any of the enabled models in chat.</Text>
        <Text textStyle="sm">The default model will be used for new conversations.</Text>
      </Stack>
    </HStack>
  );
}

function EmptyChatModelState({ message }: { message: string }) {
  return (
    <Box rounded="md" borderWidth="1px" borderColor="border.surface" bg="bg.surface" px="3" py="4">
      <Text textStyle="sm" color="fg.muted">
        {message}
      </Text>
    </Box>
  );
}

function getChatModelLabel(options: ChatModelOption[], value: string) {
  return options.find((option) => option.value === value)?.label ?? value;
}

export function EmbeddingModelDialog({
  open,
  aiDraft,
  embeddingModelOptions,
  selectedEmbeddingModel,
  selectedEmbeddingModelChanged,
  selectedEmbeddingModelKey,
  isFetchingModels,
  isSaving,
  onConfirm,
  onOpenChange,
  onSelectedModelKeyChange,
}: {
  open: boolean;
  aiDraft: AdminAiSettings;
  embeddingModelOptions: EmbeddingModelOption[];
  selectedEmbeddingModel: EmbeddingModelOption | null;
  selectedEmbeddingModelChanged: boolean;
  selectedEmbeddingModelKey: string;
  isFetchingModels: boolean;
  isSaving: boolean;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
  onSelectedModelKeyChange: (key: string) => void;
}) {
  const { accentColor } = useAccentColor();
  const [searchQuery, setSearchQuery] = useState('');
  const [providerFilter, setProviderFilter] = useState('all');
  const [visibilityFilter, setVisibilityFilter] = useState('all');
  const hasConfiguredSearchEngine =
    aiDraft.embedding.provider !== null &&
    aiDraft.embedding.model !== null;
  const providerOptions = useModelProviderOptions(embeddingModelOptions);
  const filteredEmbeddingModelOptions = useMemo(
    () =>
      embeddingModelOptions.filter((option) =>
        matchesModelFilters({
          baseUrl: option.baseUrl,
          isSelected: option.key === selectedEmbeddingModelKey,
          model: option.model,
          provider: option.provider,
          providerFilter,
          providerLabel: option.providerLabel,
          searchQuery,
          visibilityFilter,
        }),
      ),
    [embeddingModelOptions, providerFilter, searchQuery, selectedEmbeddingModelKey, visibilityFilter],
  );
  const currentModelSummary = selectedEmbeddingModel
    ? `${selectedEmbeddingModel.model} · ${formatDimensions(selectedEmbeddingModel.dimensions)}`
    : 'No embedding model selected';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent maxW="96rem" w="calc(100vw - 2rem)" maxH="calc(100vh - 2rem)">
        <DialogHeader px={{ base: '5', md: '7' }} pt="6" pb="4">
          <HStack gap="3" align="center" pe="10">
            <Box color={`${accentColor}.solid`} flexShrink={0}>
              <Layers3 size={24} />
            </Box>
            <DialogTitle>Configure Embedding Model</DialogTitle>
          </HStack>
          <DialogDescription>
            Choose the model used to generate embeddings for semantic search. Only one embedding model can be active.
          </DialogDescription>
        </DialogHeader>
        <DialogBody px={{ base: '5', md: '7' }} pb="5" overflowY="auto">
          <Stack gap="5">
            <ModelSelectionFilters
              providerFilter={providerFilter}
              providerOptions={providerOptions}
              searchQuery={searchQuery}
              visibilityFilter={visibilityFilter}
              onProviderFilterChange={setProviderFilter}
              onSearchQueryChange={setSearchQuery}
              onVisibilityFilterChange={setVisibilityFilter}
            />
            <SimpleGrid columns={{ base: 1, xl: 2 }} gap="5" alignItems="start">
              <ModelSelectionPanel
                title={`Available Models (${filteredEmbeddingModelOptions.length.toLocaleString()})`}
                description="Select a model to use for embeddings."
              >
                {embeddingModelOptions.length === 0 ? (
                  <EmptyChatModelState
                    message={
                      isFetchingModels
                        ? 'Loading available models and provider status...'
                        : 'No embedding models are selectable from a configured provider.'
                    }
                  />
                ) : filteredEmbeddingModelOptions.length === 0 ? (
                  <EmptyChatModelState message="No models match the current filters." />
                ) : (
                  <ModelSelectionList shouldScroll={filteredEmbeddingModelOptions.length > 5}>
                    <RadioGroup
                      name="embedding-model"
                      value={selectedEmbeddingModelKey}
                      onValueChange={onSelectedModelKeyChange}
                      gap="3"
                    >
                      {filteredEmbeddingModelOptions.map((option) => (
                        <EmbeddingModelSelectionCard
                          key={option.key}
                          option={option}
                          isSelected={option.key === selectedEmbeddingModelKey}
                        />
                      ))}
                    </RadioGroup>
                  </ModelSelectionList>
                )}
              </ModelSelectionPanel>
              <ModelSelectionPanel
                title="Selected Model"
                description="This model will be used for generating embeddings."
                tone="selected"
              >
                <SelectedEmbeddingModelCard
                  option={selectedEmbeddingModel}
                  selectedModelChanged={selectedEmbeddingModelChanged}
                />
                <ModelSelectionNotice>
                  Changing the embedding model requires re-indexing your documents to maintain search quality.
                </ModelSelectionNotice>
              </ModelSelectionPanel>
            </SimpleGrid>
          </Stack>
        </DialogBody>
        <DialogFooter
          px={{ base: '5', md: '7' }}
          py="4"
          borderTopWidth="1px"
          borderColor="border.surface"
        >
          <HStack gap="2" me="auto" color="fg.muted">
            <Layers3 size={16} />
            <Text textStyle="sm">Current model: {currentModelSummary}</Text>
          </HStack>
          <Button type="button" size="sm" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={
              selectedEmbeddingModel === null ||
              !selectedEmbeddingModelChanged ||
              !selectedEmbeddingModel.isDiscovered ||
              isSaving
            }
            onClick={onConfirm}
          >
            {isSaving
              ? 'Saving...'
              : hasConfiguredSearchEngine
                ? 'Save and rebuild index'
                : 'Save embedding model'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function TranslationModelDialog({
  open,
  translationModelOptions,
  selectedTranslationModel,
  selectedTranslationModelChanged,
  selectedTranslationModelKey,
  isFetchingModels,
  isSaving,
  onConfirm,
  onOpenChange,
  onSelectedModelKeyChange,
}: {
  open: boolean;
  translationModelOptions: TranslationModelOption[];
  selectedTranslationModel: TranslationModelOption | null;
  selectedTranslationModelChanged: boolean;
  selectedTranslationModelKey: string;
  isFetchingModels: boolean;
  isSaving: boolean;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
  onSelectedModelKeyChange: (key: string) => void;
}) {
  const { accentColor } = useAccentColor();
  const [searchQuery, setSearchQuery] = useState('');
  const [providerFilter, setProviderFilter] = useState('all');
  const [visibilityFilter, setVisibilityFilter] = useState('all');
  const providerOptions = useModelProviderOptions(translationModelOptions);
  const filteredTranslationModelOptions = useMemo(
    () =>
      translationModelOptions.filter((option) =>
        matchesModelFilters({
          baseUrl: option.baseUrl,
          isSelected: option.key === selectedTranslationModelKey,
          model: option.label,
          provider: option.provider,
          providerFilter,
          providerLabel: option.providerLabel,
          searchQuery,
          visibilityFilter,
        }),
      ),
    [providerFilter, searchQuery, selectedTranslationModelKey, translationModelOptions, visibilityFilter],
  );
  const currentModelSummary = selectedTranslationModel?.label ?? 'No translation model selected';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent maxW="96rem" w="calc(100vw - 2rem)" maxH="calc(100vh - 2rem)">
        <DialogHeader px={{ base: '5', md: '7' }} pt="6" pb="4">
          <HStack gap="3" align="center" pe="10">
            <Box color={`${accentColor}.solid`} flexShrink={0}>
              <Languages size={24} />
            </Box>
            <DialogTitle>Configure Translation Model</DialogTitle>
          </HStack>
          <DialogDescription>
            Choose the multimodal model used for document translation. Only one translation model can be active.
          </DialogDescription>
        </DialogHeader>
        <DialogBody px={{ base: '5', md: '7' }} pb="5" overflowY="auto">
          <Stack gap="5">
            <ModelSelectionFilters
              providerFilter={providerFilter}
              providerOptions={providerOptions}
              searchQuery={searchQuery}
              visibilityFilter={visibilityFilter}
              onProviderFilterChange={setProviderFilter}
              onSearchQueryChange={setSearchQuery}
              onVisibilityFilterChange={setVisibilityFilter}
            />
            <SimpleGrid columns={{ base: 1, xl: 2 }} gap="5" alignItems="start">
              <ModelSelectionPanel
                title={`Available Models (${filteredTranslationModelOptions.length.toLocaleString()})`}
                description="Select a model to use for translation."
              >
                {translationModelOptions.length === 0 ? (
                  <EmptyChatModelState
                    message={
                      isFetchingModels
                        ? 'Loading available models and provider status...'
                        : 'No translation models are selectable from healthy providers.'
                    }
                  />
                ) : filteredTranslationModelOptions.length === 0 ? (
                  <EmptyChatModelState message="No models match the current filters." />
                ) : (
                  <ModelSelectionList shouldScroll={filteredTranslationModelOptions.length > 5}>
                    <RadioGroup
                      name="translation-model"
                      value={selectedTranslationModelKey}
                      onValueChange={onSelectedModelKeyChange}
                      gap="3"
                    >
                      {filteredTranslationModelOptions.map((option) => (
                        <TranslationModelSelectionCard
                          key={option.key}
                          option={option}
                          isSelected={option.key === selectedTranslationModelKey}
                        />
                      ))}
                    </RadioGroup>
                  </ModelSelectionList>
                )}
              </ModelSelectionPanel>
              <ModelSelectionPanel
                title="Selected Model"
                description="This model will be used for document translation."
                tone="selected"
              >
                <SelectedTranslationModelCard
                  option={selectedTranslationModel}
                  selectedModelChanged={selectedTranslationModelChanged}
                />
                <ModelSelectionNotice>
                  Translation uses a multimodal model so Arkivra can process rendered pages and selected visual regions.
                </ModelSelectionNotice>
              </ModelSelectionPanel>
            </SimpleGrid>
          </Stack>
        </DialogBody>
        <DialogFooter
          px={{ base: '5', md: '7' }}
          py="4"
          borderTopWidth="1px"
          borderColor="border.surface"
        >
          <HStack gap="2" me="auto" color="fg.muted">
            <Languages size={16} />
            <Text textStyle="sm">Current model: {currentModelSummary}</Text>
          </HStack>
          <Button type="button" size="sm" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={selectedTranslationModel === null || !selectedTranslationModelChanged || isSaving}
            onClick={onConfirm}
          >
            {isSaving ? 'Saving...' : 'Save translation model'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function useModelProviderOptions<TOption extends { provider: string; providerLabel: string }>(
  options: TOption[],
) {
  return useMemo(
    () =>
      Array.from(
        options.reduce((providers, option) => {
          providers.set(option.provider, option.providerLabel);
          return providers;
        }, new Map<string, string>()),
      ).sort((left, right) => left[1].localeCompare(right[1])),
    [options],
  );
}

function matchesModelFilters({
  baseUrl,
  isSelected,
  model,
  provider,
  providerFilter,
  providerLabel,
  searchQuery,
  visibilityFilter,
}: {
  baseUrl: string;
  isSelected: boolean;
  model: string;
  provider: string;
  providerFilter: string;
  providerLabel: string;
  searchQuery: string;
  visibilityFilter: string;
}) {
  const normalizedSearch = searchQuery.trim().toLowerCase();
  const matchesSearch =
    normalizedSearch.length === 0 ||
    model.toLowerCase().includes(normalizedSearch) ||
    providerLabel.toLowerCase().includes(normalizedSearch) ||
    baseUrl.toLowerCase().includes(normalizedSearch);
  const matchesProvider = providerFilter === 'all' || provider === providerFilter;
  const matchesVisibility = visibilityFilter === 'all' || isSelected;

  return matchesSearch && matchesProvider && matchesVisibility;
}

function ModelSelectionFilters({
  onProviderFilterChange,
  onSearchQueryChange,
  onVisibilityFilterChange,
  providerFilter,
  providerOptions,
  searchQuery,
  visibilityFilter,
}: {
  onProviderFilterChange: (value: string) => void;
  onSearchQueryChange: (value: string) => void;
  onVisibilityFilterChange: (value: string) => void;
  providerFilter: string;
  providerOptions: Array<[string, string]>;
  searchQuery: string;
  visibilityFilter: string;
}) {
  return (
    <SimpleGrid columns={{ base: 1, md: 3 }} gap="5" alignItems="end">
      <Stack gap="1.5">
        <Text textStyle="xs" fontWeight="semibold" color="fg.muted">
          Search
        </Text>
        <Box position="relative">
          <Box
            position="absolute"
            insetStart="3"
            top="50%"
            transform="translateY(-50%)"
            color="fg.muted"
            pointerEvents="none"
          >
            <Search size={16} />
          </Box>
          <Input
            aria-label="Search models"
            value={searchQuery}
            ps="9"
            h="12"
            bg="bg.surface"
            placeholder="Search models..."
            onChange={(event) => onSearchQueryChange(event.currentTarget.value)}
          />
        </Box>
      </Stack>
      <Stack gap="1.5">
        <Text textStyle="xs" fontWeight="semibold" color="fg.muted">
          Provider
        </Text>
        <Select
          value={providerFilter}
          onValueChange={onProviderFilterChange}
          positioning={{ sameWidth: true }}
        >
          <SelectTrigger aria-label="Provider filter" bg="bg.surface">
            <SelectValue placeholder="All Providers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Providers</SelectItem>
            {providerOptions.map(([provider, label]) => (
              <SelectItem key={provider} value={provider}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Stack>
      <Stack gap="1.5">
        <Text textStyle="xs" fontWeight="semibold" color="fg.muted">
          Show
        </Text>
        <Select
          value={visibilityFilter}
          onValueChange={onVisibilityFilterChange}
          positioning={{ sameWidth: true }}
        >
          <SelectTrigger aria-label="Model visibility filter" bg="bg.surface">
            <SelectValue placeholder="All models" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All models</SelectItem>
            <SelectItem value="selected">Selected model</SelectItem>
          </SelectContent>
        </Select>
      </Stack>
    </SimpleGrid>
  );
}

function ModelSelectionPanel({
  children,
  description,
  title,
  tone,
}: {
  children: ReactNode;
  description: string;
  title: string;
  tone?: 'selected';
}) {
  return (
    <Stack
      gap="4"
      h={{ base: 'auto', xl: chatModelPanelH }}
      rounded="md"
      borderWidth="1px"
      borderColor={tone === 'selected' ? 'blue.muted' : 'border.surface'}
      bg={tone === 'selected' ? 'blue.subtle' : 'bg.subtle'}
      p={{ base: '3', md: '4' }}
    >
      <Stack gap="1" minW="0">
        <Text textStyle="md" fontWeight="semibold" color={tone === 'selected' ? 'blue.fg' : 'fg'}>
          {title}
        </Text>
        <Text textStyle="sm" color="fg.muted">
          {description}
        </Text>
      </Stack>
      {children}
    </Stack>
  );
}

function ModelSelectionList({
  children,
  shouldScroll,
}: {
  children: ReactNode;
  shouldScroll: boolean;
}) {
  return (
    <Box
      h={shouldScroll ? chatModelListMaxH : undefined}
      maxH={shouldScroll ? chatModelListMaxH : undefined}
      minH="0"
      overflowY={shouldScroll ? 'scroll' : 'visible'}
      pe={shouldScroll ? '1' : undefined}
      css={shouldScroll ? { scrollbarGutter: 'stable' } : undefined}
    >
      {children}
    </Box>
  );
}

function EmbeddingModelSelectionCard({
  isSelected,
  option,
}: {
  isSelected: boolean;
  option: EmbeddingModelOption;
}) {
  return (
    <Flex
      as="label"
      align="center"
      justify="space-between"
      gap="3"
      minH={chatModelCardMinH}
      rounded="lg"
      borderWidth="1px"
      borderColor={isSelected ? 'blue.solid' : 'border.surface'}
      bg="bg.surface"
      px={{ base: '3', md: '4' }}
      py="3"
      shadow={isSelected ? 'sm' : 'xs'}
      cursor="pointer"
      _hover={{ borderColor: isSelected ? 'blue.solid' : 'border.strong' }}
    >
      <HStack gap="3" minW="0" align="center">
        <RadioGroupItem value={option.key} />
        <Stack gap="0.5" minW="0">
          <Text textStyle="sm" fontWeight="semibold" color="fg" truncate>
            {option.model}
          </Text>
          <Text textStyle="sm" color="fg.muted" truncate>
            {option.providerLabel}
          </Text>
        </Stack>
      </HStack>
      <HStack gap="2" flexShrink={0}>
        {option.dimensions !== null ? (
          <Badge variant="outline">{formatDimensions(option.dimensions)}</Badge>
        ) : null}
        {!option.isDiscovered ? (
          <Badge variant="outline" colorPalette="gray">
            Unavailable
          </Badge>
        ) : null}
      </HStack>
    </Flex>
  );
}

function TranslationModelSelectionCard({
  isSelected,
  option,
}: {
  isSelected: boolean;
  option: TranslationModelOption;
}) {
  return (
    <Flex
      as="label"
      align="center"
      justify="space-between"
      gap="3"
      minH={chatModelCardMinH}
      rounded="lg"
      borderWidth="1px"
      borderColor={isSelected ? 'blue.solid' : 'border.surface'}
      bg="bg.surface"
      px={{ base: '3', md: '4' }}
      py="3"
      shadow={isSelected ? 'sm' : 'xs'}
      cursor="pointer"
      _hover={{ borderColor: isSelected ? 'blue.solid' : 'border.strong' }}
    >
      <HStack gap="3" minW="0" align="center">
        <RadioGroupItem value={option.key} />
        <Stack gap="0.5" minW="0">
          <Text textStyle="sm" fontWeight="semibold" color="fg" truncate>
            {option.label}
          </Text>
          <Text textStyle="sm" color="fg.muted" truncate>
            {option.providerLabel}
          </Text>
        </Stack>
      </HStack>
      <Badge variant="outline" flexShrink={0}>
        Multimodal
      </Badge>
    </Flex>
  );
}

function SelectedEmbeddingModelCard({
  option,
  selectedModelChanged,
}: {
  option: EmbeddingModelOption | null;
  selectedModelChanged: boolean;
}) {
  if (option === null) {
    return <EmptySelectedModelCard message="No embedding model selected." />;
  }

  return (
    <SelectedModelCard
      capabilityLabel="Dimensions"
      capabilityValue={formatDimensionValue(option.dimensions)}
      isUnavailable={!option.isDiscovered}
      model={option.model}
      provider={option.provider}
      providerLabel={option.providerLabel}
      selectedModelChanged={selectedModelChanged}
      statusLabel={option.isActive ? 'Active index' : option.isConfigured ? 'Configured' : 'Available'}
    />
  );
}

function SelectedTranslationModelCard({
  option,
  selectedModelChanged,
}: {
  option: TranslationModelOption | null;
  selectedModelChanged: boolean;
}) {
  if (option === null) {
    return <EmptySelectedModelCard message="No translation model selected." />;
  }

  return (
    <SelectedModelCard
      capabilityLabel="Capability"
      capabilityValue="Multimodal"
      model={option.label}
      provider={option.provider}
      providerLabel={option.providerLabel}
      selectedModelChanged={selectedModelChanged}
      statusLabel={option.isConfigured ? 'Configured' : 'Available'}
    />
  );
}

function SelectedModelCard({
  capabilityLabel,
  capabilityValue,
  isUnavailable = false,
  model,
  provider,
  providerLabel,
  selectedModelChanged,
  statusLabel,
}: {
  capabilityLabel: string;
  capabilityValue: string;
  isUnavailable?: boolean;
  model: string;
  provider: AdminAiSettings['chat']['provider'];
  providerLabel: string;
  selectedModelChanged: boolean;
  statusLabel: string;
}) {
  return (
    <Stack
      gap="5"
      rounded="lg"
      borderWidth="1px"
      borderColor="blue.muted"
      bg="bg.surface"
      px={{ base: '4', md: '5' }}
      py="5"
    >
      <HStack gap="4" align="center">
        <ProviderGlyph provider={provider} providerLabel={providerLabel} />
        <Stack gap="2" minW="0">
          <Text textStyle="2xl" fontWeight="semibold" color="fg" wordBreak="break-word">
            {model}
          </Text>
          <Text textStyle="md" color="fg.muted">
            {providerLabel}
          </Text>
        </Stack>
      </HStack>
      <SimpleGrid columns={{ base: 1, md: 3 }} gap="4">
        <SelectedModelMetric icon={<Sparkles size={18} />} label={capabilityLabel} value={capabilityValue} />
        <SelectedModelMetric icon={<Server size={18} />} label="Provider" value={providerLabel} />
        <SelectedModelMetric icon={<Database size={18} />} label="Status" value={statusLabel} />
      </SimpleGrid>
      <HStack
        justify="center"
        rounded="md"
        borderWidth="1px"
        borderColor={isUnavailable ? 'orange.muted' : selectedModelChanged ? 'blue.muted' : 'green.muted'}
        bg={isUnavailable ? 'orange.subtle' : selectedModelChanged ? 'blue.subtle' : 'green.subtle'}
        color={isUnavailable ? 'orange.fg' : selectedModelChanged ? 'blue.fg' : 'green.fg'}
        px="3"
        py="2.5"
      >
        <CheckCircle2 size={16} />
        <Text textStyle="sm" fontWeight="semibold">
          {isUnavailable
            ? 'Unavailable'
            : selectedModelChanged
              ? 'Selected for save'
              : 'Currently selected'}
        </Text>
      </HStack>
    </Stack>
  );
}

function ProviderGlyph({
  provider,
  providerLabel,
}: {
  provider: AdminAiSettings['chat']['provider'];
  providerLabel: string;
}) {
  return (
    <Flex
      boxSize="6.5rem"
      flexShrink={0}
      align="center"
      justify="center"
      rounded="lg"
      borderWidth="1px"
      borderColor="blue.muted"
      bg="blue.subtle"
      color="fg"
    >
      <Text textStyle="3xl" fontWeight="semibold">
        {provider === 'ollama' ? 'Ol' : providerLabel.slice(0, 1)}
      </Text>
    </Flex>
  );
}

function SelectedModelMetric({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <HStack gap="3" minW="0">
      <Box color="fg.muted" flexShrink={0}>
        {icon}
      </Box>
      <Stack gap="0" minW="0">
        <Text textStyle="sm" color="fg.muted">
          {label}
        </Text>
        <Text textStyle="sm" fontWeight="semibold" color="fg" truncate>
          {value}
        </Text>
      </Stack>
    </HStack>
  );
}

function ModelSelectionNotice({ children }: { children: ReactNode }) {
  return (
    <HStack
      gap="3"
      align="center"
      rounded="md"
      borderWidth="1px"
      borderColor="blue.muted"
      bg="bg.surface"
      px={{ base: '3', md: '4' }}
      py="4"
      mt="auto"
      color="fg.muted"
    >
      <Box color="blue.fg" flexShrink={0}>
        <Info size={24} />
      </Box>
      <Text textStyle="sm">{children}</Text>
    </HStack>
  );
}

function EmptySelectedModelCard({ message }: { message: string }) {
  return (
    <Box
      rounded="lg"
      borderWidth="1px"
      borderColor="border.surface"
      bg="bg.surface"
      px="4"
      py="6"
    >
      <Text textStyle="sm" color="fg.muted">
        {message}
      </Text>
    </Box>
  );
}

function formatDimensions(dimensions: number | null | undefined) {
  return dimensions === null || dimensions === undefined
    ? 'Unknown dims'
    : `${dimensions.toLocaleString()} dims`;
}

function formatDimensionValue(dimensions: number | null | undefined) {
  return dimensions === null || dimensions === undefined
    ? 'Unknown'
    : dimensions.toLocaleString();
}
