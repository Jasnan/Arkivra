import { useMemo, useState } from 'react';
import {
  Box,
  Flex,
  HStack,
  RadioGroup as ChakraRadioGroup,
  SimpleGrid,
  Stack,
  Text,
  chakra,
} from '@chakra-ui/react';
import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Search } from 'lucide-react';
import googleBrandSvg from '@/assets/brand-google.svg?raw';
import { useAccentColor } from '@/components/providers/accent-color-context';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
import type { EmbeddingModelOption } from './admin-ai-settings-page-model-catalog';

interface ChatModelOption {
  value: string;
  provider: AdminAiSettings['chat']['provider'];
  providerLabel: string;
  model: string;
  label: string;
  baseUrl: string;
  description?: string | null;
}

export interface TranslationModelOption {
  key: string;
  provider: AdminAiSettings['translation']['provider'];
  providerLabel: string;
  model: string;
  label: string;
  baseUrl: string;
  description?: string | null;
  isConfigured: boolean;
}

const visibleChatModelCardCount = 5;
const chatModelCardMinH = '3.5rem';
const chatModelListMaxH = '19.5rem';
const chatModelPanelH = '24.5rem';

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
      <DialogContent maxW="72rem" w="calc(100vw - 2rem)" maxH="calc(100vh - 2rem)">
        <DialogHeader px="5" pt="5" pb="3">
          <DialogTitle>Configure Chat Models</DialogTitle>
          <DialogDescription>
            Choose which chat models users can access and select the default model for new chats.
          </DialogDescription>
        </DialogHeader>
        <DialogBody px="5" pb="4" overflowY="auto">
          <Stack gap="4">
            <SimpleGrid columns={{ base: 1, md: 3 }} gap="3" alignItems="end">
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
                    ? 'Loading chat models from configured providers...'
                    : 'No chat models are available from the configured providers.'
                }
              />
            ) : !hasFilteredResults ? (
              <EmptyChatModelState message="No models match the current filters." />
            ) : (
              <SimpleGrid columns={{ base: 1, lg: 2 }} gap="4" alignItems="start">
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
                  description="Models users can choose in chat."
                  tone="enabled"
                >
                  {enabledModelOptions.length > 0 ? (
                    <ChatModelList
                      shouldScroll={enabledModelOptions.length > visibleChatModelCardCount}
                      maxH={chatModelListMaxH}
                    >
                      <ChakraRadioGroup.Root
                        name="default-chat-model"
                        value={draftDefaultChatModel}
                        colorPalette={accentColor}
                        size="sm"
                        variant="solid"
                        onValueChange={(details) => {
                          if (details.value !== null) {
                            onDefaultModelChange(details.value);
                          }
                        }}
                      >
                        <Stack gap="2">
                          {enabledModelOptions.map((option) => (
                            <ChatModelCard
                              key={option.value}
                              accentColor={accentColor}
                              option={option}
                              isDefault={option.value === draftDefaultChatModel}
                              variant="enabled"
                              onDisable={() => handleDisable(option)}
                            />
                          ))}
                        </Stack>
                      </ChakraRadioGroup.Root>
                    </ChatModelList>
                  ) : (
                    <EmptyChatModelState message="No enabled models match the current filters." />
                  )}
                </ChatModelPanel>
              </SimpleGrid>
            )}
          </Stack>
        </DialogBody>
        <DialogFooter px="5" py="4" borderTopWidth="1px" borderColor="border.surface">
          <HStack gap="2" me="auto" color={isDefaultEnabled ? 'fg.muted' : 'orange.fg'}>
            <CheckCircle2 size={16} />
            <Text textStyle="sm">
              {draftAllowedChatModels.length.toLocaleString()} models enabled
              {isDefaultEnabled
                ? ` · ${getChatModelLabel(chatModelOptions, draftDefaultChatModel)} is default`
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
  title,
  tone,
}: {
  children: ReactNode;
  description: string;
  title: string;
  tone?: 'enabled';
}) {
  return (
    <Stack
      gap="3"
      h={{ base: 'auto', lg: chatModelPanelH }}
      rounded="lg"
      borderWidth="1px"
      borderColor={tone === 'enabled' ? 'teal.muted' : 'border.surface'}
      bg={tone === 'enabled' ? 'teal.subtle' : 'bg.subtle'}
      p="3"
    >
      <Stack gap="0.5" minW="0">
        <Text textStyle="sm" fontWeight="semibold" color={tone === 'enabled' ? 'teal.fg' : 'fg'}>
          {title}
        </Text>
        <Text textStyle="xs" color="fg.muted">
          {description}
        </Text>
      </Stack>
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
  option,
  variant,
}: {
  accentColor: string;
  isDefault?: boolean;
  onDisable?: () => void;
  onEnable?: () => void;
  option: ChatModelOption;
  variant: 'available' | 'enabled';
}) {
  return (
    <Box
      rounded="lg"
      borderWidth="1px"
      borderColor={isDefault ? `${accentColor}.solid` : 'border.surface'}
      bg="bg.surface"
      minH={chatModelCardMinH}
      display="flex"
      alignItems="center"
      px="2.5"
      py="2"
      shadow={isDefault ? 'sm' : 'xs'}
    >
      <HStack align="center" gap="2.5" w="full">
        <ModelProviderIcon provider={option.provider} />
        <Stack gap="1.5" minW="0" flex="1" justify="center">
          <Stack gap="1" minW="0">
            <HStack gap="2" minW="0" justify="space-between" align="center">
              <HStack gap="2" minW="0" flex="1" flexWrap="wrap" align="center">
                <Text textStyle="sm" fontWeight="semibold" color="fg" wordBreak="break-word">
                  {option.label}
                </Text>
                <Badge variant="outline" colorPalette={getProviderBadgeColor(option.provider)}>
                  {option.providerLabel}
                </Badge>
              </HStack>
              {variant === 'available' ? (
                <Button type="button" size="xs" variant="outline" flexShrink={0} onClick={onEnable}>
                  Enable
                </Button>
              ) : null}
              {variant === 'enabled' ? (
                <HStack gap="2" flexShrink={0}>
                  <DefaultChatModelRadioItem isDefault={isDefault} value={option.value} />
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    disabled={isDefault}
                    onClick={onDisable}
                  >
                    Disable
                  </Button>
                </HStack>
              ) : null}
            </HStack>
            {option.description ? (
              <Text textStyle="xs" color="fg.muted">
                {option.description}
              </Text>
            ) : null}
          </Stack>
        </Stack>
      </HStack>
    </Box>
  );
}

function DefaultChatModelRadioItem({
  isDefault,
  value,
}: {
  isDefault: boolean;
  value: string;
}) {
  return (
    <ChakraRadioGroup.Item value={value} display="inline-flex" alignItems="center" gap="2">
      <ChakraRadioGroup.ItemHiddenInput />
      <ChakraRadioGroup.ItemControl boxSize="4" flexShrink={0}>
        <ChakraRadioGroup.ItemIndicator boxSize="2" />
      </ChakraRadioGroup.ItemControl>
      <ChakraRadioGroup.ItemText
        textStyle="xs"
        color={isDefault ? 'fg' : 'fg.muted'}
        cursor="pointer"
      >
        {isDefault ? 'Default model' : 'Set as default'}
      </ChakraRadioGroup.ItemText>
    </ChakraRadioGroup.Item>
  );
}

function ModelProviderIcon({ provider }: { provider: ChatModelOption['provider'] }) {
  return (
    <Flex
      w="7"
      h="7"
      flexShrink={0}
      align="center"
      justify="center"
      rounded="md"
      borderWidth="1px"
      borderColor="border.surface"
      bg={provider === 'gemini' ? 'teal.subtle' : 'bg.subtle'}
      color={provider === 'gemini' ? 'teal.fg' : 'fg.muted'}
    >
      {provider === 'gemini' ? (
        <chakra.span
          aria-hidden="true"
          display="inline-block"
          h="3.5"
          w="3.5"
          lineHeight="0"
          css={{
            '& svg': {
              display: 'block',
              height: '100%',
              width: '100%',
            },
          }}
          // eslint-disable-next-line react-dom/no-dangerously-set-innerhtml -- Local provider SVG rendered inline so currentColor follows the surrounding token.
          dangerouslySetInnerHTML={{ __html: googleBrandSvg }}
        />
      ) : (
        <Text as="span" textStyle="xs" fontWeight="bold" lineHeight="1">
          Ol
        </Text>
      )}
    </Flex>
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

function getProviderBadgeColor(provider: ChatModelOption['provider']) {
  if (provider === 'gemini') return 'teal';

  return 'gray';
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
  isFetchingOllamaModels,
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
  isFetchingOllamaModels: boolean;
  isSaving: boolean;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
  onSelectedModelKeyChange: (key: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent maxW="38rem" w="calc(100vw - 2rem)">
        <DialogHeader px="5" pt="5" pb="3">
          <DialogTitle>Change embedding model</DialogTitle>
          <DialogDescription>
            Select the model Arkivra should use for new semantic indexes. The live index keeps
            serving search until the new one is ready.
          </DialogDescription>
        </DialogHeader>
        <DialogBody px="5" pb="4">
          <Stack gap="4">
            <Box
              rounded="md"
              borderWidth="1px"
              borderColor="border.surface"
              bg="bg.surface"
              overflow="hidden"
            >
              <Box px="3" py="2" borderBottomWidth="1px" borderColor="border.surface">
                <Text textStyle="sm" fontWeight="semibold" color="fg">
                  Available embedding models
                </Text>
              </Box>
              {embeddingModelOptions.length > 0 ? (
                <RadioGroup
                  name="embedding-model"
                  value={selectedEmbeddingModelKey}
                  onValueChange={onSelectedModelKeyChange}
                  gap="0"
                  divideY="1px"
                  divideColor="border.surface"
                >
                  {embeddingModelOptions.map((option) => (
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
                        {option.isConfigured ? (
                          <Badge variant="secondary" colorPalette="teal">
                            Selected
                          </Badge>
                        ) : null}
                        {option.isActive && !option.isConfigured ? (
                          <Badge variant="outline">Live index</Badge>
                        ) : null}
                        {!option.isDiscovered ? (
                          <Badge variant="outline" colorPalette="gray">
                            Not listed
                          </Badge>
                        ) : null}
                      </HStack>
                    </Flex>
                  ))}
                </RadioGroup>
              ) : (
                <Text px="3" py="3" textStyle="sm" color="fg.muted">
                  {isFetchingOllamaModels
                    ? 'Loading models from Ollama...'
                    : 'No catalog embedding models were found from the configured Ollama endpoint.'}
                </Text>
              )}
            </Box>
            <Alert
              status="warning"
              colorPalette="orange"
              borderColor="orange.muted"
              bg="orange.subtle"
              alignItems="flex-start"
            >
              <AlertTriangle size={16} />
              <AlertDescription>
                <Stack gap="2">
                  <Text fontWeight="semibold">
                    Changing the embedding model requires rebuilding the semantic search index.
                  </Text>
                  <Stack as="ul" gap="1" ps="4">
                    <Text as="li">
                      The current index will remain available until the new index is ready.
                    </Text>
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
          <Button type="button" size="sm" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={selectedEmbeddingModel === null || !selectedEmbeddingModelChanged || isSaving}
            onClick={onConfirm}
          >
            {isSaving ? 'Saving...' : 'Confirm and rebuild'}
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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent maxW="38rem" w="calc(100vw - 2rem)">
        <DialogHeader px="5" pt="5" pb="3">
          <DialogTitle>Change translation model</DialogTitle>
          <DialogDescription>
            Select one model for document translation from the configured providers.
          </DialogDescription>
        </DialogHeader>
        <DialogBody px="5" pb="4">
          <Stack gap="4">
            <Alert
              status="warning"
              colorPalette="orange"
              borderColor="orange.muted"
              bg="orange.subtle"
              alignItems="flex-start"
            >
              <AlertTriangle size={16} />
              <AlertDescription>
                <Stack gap="1">
                  <Text fontWeight="semibold">
                    Translation requires a multimodal model that accepts image input.
                  </Text>
                  <Text>
                    Arkivra can send rendered PDF pages and selected visual regions as images when
                    translating scanned or image-only documents.
                  </Text>
                </Stack>
              </AlertDescription>
            </Alert>
            <Box
              rounded="md"
              borderWidth="1px"
              borderColor="border.surface"
              bg="bg.surface"
              overflow="hidden"
            >
              <Box px="3" py="2" borderBottomWidth="1px" borderColor="border.surface">
                <Text textStyle="sm" fontWeight="semibold" color="fg">
                  Available translation models
                </Text>
              </Box>
              {translationModelOptions.length > 0 ? (
                <RadioGroup
                  name="translation-model"
                  value={selectedTranslationModelKey}
                  onValueChange={onSelectedModelKeyChange}
                  gap="0"
                  divideY="1px"
                  divideColor="border.surface"
                >
                  {translationModelOptions.map((option) => (
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
                            {option.label}
                          </Text>
                          <Text textStyle="xs" color="fg.muted" truncate>
                            {option.providerLabel}
                            {option.baseUrl ? ` · ${option.baseUrl}` : ''}
                          </Text>
                          {option.description ? (
                            <Text textStyle="xs" color="fg.muted" truncate>
                              {option.description}
                            </Text>
                          ) : null}
                        </Stack>
                      </HStack>
                      <HStack gap="1.5" flexShrink={0}>
                        {option.isConfigured ? (
                          <Badge variant="secondary" colorPalette="teal">
                            Selected
                          </Badge>
                        ) : null}
                        <Badge variant="outline" colorPalette={getProviderBadgeColor(option.provider)}>
                          {option.providerLabel}
                        </Badge>
                      </HStack>
                    </Flex>
                  ))}
                </RadioGroup>
              ) : (
                <Text px="3" py="3" textStyle="sm" color="fg.muted">
                  {isFetchingModels
                    ? 'Loading models from configured providers...'
                    : 'No translation models are available from the configured providers.'}
                </Text>
              )}
            </Box>
          </Stack>
        </DialogBody>
        <DialogFooter px="5" pb="5" pt="0">
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
