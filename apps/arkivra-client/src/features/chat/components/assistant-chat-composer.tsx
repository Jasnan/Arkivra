import type { ChangeEvent, RefObject } from 'react';
import { Fragment, useMemo } from 'react';
import {
  Box,
  Flex,
  Menu,
  Portal,
  Text,
  chakra,
} from '@chakra-ui/react';
import { ComposerPrimitive } from '@assistant-ui/react';
import { Brain, Check, ChevronDown, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ChatResponseMode } from '../chat.api';
import { AnswerModePicker } from './answer-mode-picker';
import {
  formatChatModelLabel,
  formatChatModelName,
  formatChatModelProviderLabel,
} from './chat-utils';
import type { DraftChatContext, DraftChatDocument, DraftChatVault } from './chat-context-selector';
import { ChatContextAddMenu, ContextChipList } from './chat-context-selector';

const ComposerRoot = chakra(ComposerPrimitive.Root);
const ComposerInput = chakra(ComposerPrimitive.Input);
const ComposerSend = chakra(ComposerPrimitive.Send);

interface ModelSelectItem {
  label: string;
  value: string;
  category: string;
}

export function AssistantChatComposer({
  disabled,
  placeholder,
  responseMode,
  modelOptions,
  selectedModel,
  isLoadingModels,
  modelOptionsError,
  onSelectedModelChange,
  onResponseModeChange,
  context,
  contextLocked,
  onAddVaults,
  onAddDocuments,
  onRemoveVault,
  onRemoveDocument,
  textareaRef,
  onDraftValueChange,
}: {
  disabled: boolean;
  placeholder: string;
  responseMode: ChatResponseMode;
  modelOptions?: string[];
  selectedModel: string;
  isLoadingModels?: boolean;
  modelOptionsError?: string | null;
  onSelectedModelChange?: (nextValue: string) => void;
  onResponseModeChange: (nextValue: ChatResponseMode) => void;
  context?: DraftChatContext;
  contextLocked?: boolean;
  onAddVaults?: () => void;
  onAddDocuments?: () => void;
  onRemoveVault?: (vault: DraftChatVault) => void;
  onRemoveDocument?: (document: DraftChatDocument) => void;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  onDraftValueChange: (nextValue: string) => void;
}) {
  const hasModelPicker = Boolean(onSelectedModelChange);
  const modelLabel = selectedModel
    ? formatChatModelLabel(selectedModel)
    : (isLoadingModels ? 'Loading models' : 'No model');
  const modelCategories = useMemo(() => {
    const categories = new Map<string, ModelSelectItem[]>();

    for (const model of modelOptions ?? []) {
      const item = {
        value: model,
        label: formatChatModelName(model),
        category: formatChatModelProviderLabel(model),
      };
      categories.set(item.category, [...(categories.get(item.category) ?? []), item]);
    }

    return Array.from(categories.entries());
  }, [modelOptions]);

  function handleComposerChange(event: ChangeEvent<HTMLTextAreaElement>) {
    onDraftValueChange(event.currentTarget.value);
  }

  return (
    <Box alignSelf="end" flexShrink="0" px="4" pb="4" pt="2" sm={{ px: '6', pb: '5' }}>
      <ComposerRoot
        mx="auto"
        w="100%"
        maxW="54rem"
        rounded="lg"
        borderWidth="1px"
        borderColor="border.surface"
        bg="bg.surface"
        p="3"
        boxShadow="md"
      >
        {context && onRemoveVault && onRemoveDocument ? (
          <ContextChipList
            context={context}
            locked={Boolean(contextLocked)}
            disabled={disabled}
            onRemoveVault={onRemoveVault}
            onRemoveDocument={onRemoveDocument}
          />
        ) : null}

        <ComposerInput
          ref={textareaRef}
          aria-label="Chat message"
          placeholder={placeholder}
          disabled={disabled}
          submitMode="enter"
          minRows={1}
          maxRows={8}
          fontFamily="chat"
          fontSize="var(--arkivra-font-size-chat)"
          lineHeight="1.6"
          minH="2.75rem"
          maxH="14rem"
          w="100%"
          resize="none"
          borderWidth="0"
          bg="transparent"
          px="3"
          py="3"
          boxShadow="none"
          _hover={{ borderColor: 'transparent' }}
          _focusVisible={{
            borderColor: 'transparent',
            outline: 'none',
            ring: 'none',
          }}
          onChange={handleComposerChange}
        />

        <Flex align="center" justify="space-between" gap="3" pt="3">
          <Flex align="center" gap="2" minW="0" flex="1" flexWrap="wrap">
            {onAddVaults && onAddDocuments ? (
              <ChatContextAddMenu
                disabled={disabled}
                onAddVaults={onAddVaults}
                onAddDocuments={onAddDocuments}
              />
            ) : null}
            <Flex align="center" gap="2" minW="0" flexWrap="nowrap">
              <AnswerModePicker disabled={disabled} value={responseMode} onValueChange={onResponseModeChange} />

              {hasModelPicker ? (
                <Menu.Root positioning={{ placement: 'bottom-start', gutter: 6 }}>
                  <Menu.Trigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      aria-label="Select model"
                      title="Select model"
                      disabled={disabled}
                      size="sm"
                      minW="0"
                      w={{ base: '15rem', sm: '22rem' }}
                      maxW="100%"
                      h="9"
                      justifyContent="space-between"
                      gap="2"
                      rounded="lg"
                      px="2.5"
                      color="fg.muted"
                      shadow="none"
                      _hover={{ bg: 'bg.subtle', color: 'fg' }}
                      _focusVisible={{
                        borderColor: 'teal.solid',
                        outline: '2px solid',
                        outlineColor: 'teal.focusRing',
                        outlineOffset: '1px',
                      }}
                      _disabled={{ opacity: 0.45, cursor: 'not-allowed' }}
                    >
                      <Flex minW="0" align="center" gap="2">
                        <Box color="fg.muted" aria-hidden="true">
                          <Brain size={16} />
                        </Box>
                        <Text
                          as="span"
                          truncate
                          fontSize="sm"
                          fontWeight="medium"
                        >
                          {modelLabel}
                        </Text>
                      </Flex>
                      <Box flexShrink={0} color="fg.muted" aria-hidden="true">
                        <ChevronDown size={16} />
                      </Box>
                    </Button>
                  </Menu.Trigger>
                  <Portal>
                    <Menu.Positioner zIndex="dropdown">
                      <Menu.Content
                        minW="22rem"
                        maxW="calc(100vw - 2rem)"
                        rounded="lg"
                        borderWidth="1px"
                        borderColor="border.surface"
                        bg="bg.surface"
                        p="1.5"
                        shadow="lg"
                      >
                        {isLoadingModels ? (
                          <Text px="3" py="var(--arkivra-menuItemPaddingY, 0.5rem)" fontSize="sm" color="fg.muted">
                            Loading models...
                          </Text>
                        ) : modelCategories.length > 0 ? (
                          <Menu.RadioItemGroup
                            value={selectedModel}
                            onValueChange={(event) => {
                              if (event.value) {
                                onSelectedModelChange?.(event.value);
                              }
                            }}
                          >
                            {modelCategories.map(([category, items]) => (
                              <Fragment key={category}>
                                <Text
                                  as="div"
                                  px="3"
                                  py="1.5"
                                  fontSize="xs"
                                  fontWeight="semibold"
                                  color="fg.muted"
                                >
                                  {category}
                                </Text>
                                {items.map(item => (
                                  <Menu.RadioItem
                                    key={item.value}
                                    value={item.value}
                                    position="relative"
                                    minH="var(--arkivra-menuItemMinHeight, 2.5rem)"
                                    rounded="md"
                                    py="var(--arkivra-menuItemPaddingY, 0.5rem)"
                                    ps="3"
                                    pe="10"
                                    fontSize="sm"
                                    fontWeight="medium"
                                    color="fg"
                                    borderWidth="1px"
                                    borderColor={selectedModel === item.value ? 'teal.muted' : 'transparent'}
                                    _checked={{ bg: 'teal.subtle', borderColor: 'teal.muted', color: 'teal.fg' }}
                                    _highlighted={{ bg: 'teal.subtle', borderColor: 'teal.muted', color: 'teal.fg' }}
                                  >
                                    <Box
                                      position="absolute"
                                      right="2.5"
                                      top="50%"
                                      display="flex"
                                      boxSize="5"
                                      alignItems="center"
                                      justifyContent="center"
                                      rounded="sm"
                                      color="teal.solid"
                                      transform="translateY(-50%)"
                                    >
                                      <Menu.ItemIndicator>
                                        <Check size={16} strokeWidth={2.5} />
                                      </Menu.ItemIndicator>
                                    </Box>
                                    <Menu.ItemText>{item.label}</Menu.ItemText>
                                  </Menu.RadioItem>
                                ))}
                              </Fragment>
                            ))}
                          </Menu.RadioItemGroup>
                        ) : (
                          <Text px="3" py="var(--arkivra-menuItemPaddingY, 0.5rem)" fontSize="sm" color="fg.muted">
                            No models available
                          </Text>
                        )}
                      </Menu.Content>
                    </Menu.Positioner>
                  </Portal>
                </Menu.Root>
              ) : null}
            </Flex>
          </Flex>

          <ComposerSend
            type="submit"
            aria-label="Send message"
            display="inline-flex"
            alignItems="center"
            justifyContent="center"
            flexShrink="0"
            w="2.25rem"
            h="2.25rem"
            rounded="lg"
            bg="teal.solid"
            color="fg.inverted"
            _hover={{ bg: 'teal.emphasized' }}
            _disabled={{ opacity: 0.45, cursor: 'not-allowed' }}
          >
            <Send size={16} />
          </ComposerSend>
        </Flex>

        {modelOptionsError ? (
          <Text mt="3" px="1" fontSize="xs" color="fg.error">{modelOptionsError}</Text>
        ) : null}
      </ComposerRoot>
    </Box>
  );
}
