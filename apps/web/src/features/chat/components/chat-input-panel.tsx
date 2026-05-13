import type { RefObject } from 'react';
import { useEffect, useState } from 'react';
import { Box, Flex, Group, Popover, RadioCard, Text, chakra } from '@chakra-ui/react';
import { Brain, Check, ChevronDown, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { ChatResponseMode } from '../chat.api';

const responseModeOptions = [
  {
    title: 'Quick answer',
    value: 'text',
    description: 'Best for fast replies when you do not need source previews.',
  },
  {
    title: 'Cited answer',
    value: 'multimodal',
    description: 'Use when you want document citations and source evidence.',
  },
] satisfies Array<{ title: string; value: ChatResponseMode; description: string }>;

export function ChatInputPanel({
  disabled,
  placeholder,
  responseMode,
  modelOptions,
  selectedModel,
  isLoadingModels,
  modelOptionsError,
  onSelectedModelChange,
  onResponseModeChange,
  value,
  onValueChange,
  textareaRef,
  onSubmit,
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
  value: string;
  onValueChange: (nextValue: string) => void;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  onSubmit: (content: string) => void;
}) {
  const hasModelPicker = Boolean(onSelectedModelChange);
  const [isAnswerModePopoverOpen, setIsAnswerModePopoverOpen] = useState(false);
  const [isModelPopoverOpen, setIsModelPopoverOpen] = useState(false);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = '0px';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 224)}px`;
  }, [textareaRef, value]);

  function submit() {
    const content = value.trim();
    if (content.length === 0 || disabled) return;
    onValueChange('');
    onSubmit(content);
  }

  function handleResponseModeChange(nextValue: string | null) {
    if (nextValue === 'multimodal' || nextValue === 'text') {
      onResponseModeChange(nextValue);
      setIsAnswerModePopoverOpen(false);
    }
  }

  const responseModeLabel =
    responseModeOptions.find((option) => option.value === responseMode)?.title ?? 'Answer mode';
  const modelLabel = selectedModel || (isLoadingModels ? 'Loading models' : 'No model');

  function selectModel(model: string) {
    onSelectedModelChange?.(model);
    setIsModelPopoverOpen(false);
  }

  return (
    <Box alignSelf="end" flexShrink="0" px="4" pb="4" pt="2" sm={{ px: '6', pb: '5' }}>
      <Box
        mx="auto"
        w="100%"
        maxW="54rem"
        rounded="lg"
        borderWidth="1px"
        borderColor="border.subtle"
        bg="bg.surface"
        p="3"
        boxShadow="md"
      >
        <Textarea
          ref={textareaRef}
          aria-label="Chat message"
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
          placeholder={placeholder}
          disabled={disabled}
          style={{
            minHeight: '2.75rem',
            maxHeight: '14rem',
            width: '100%',
            resize: 'none',
            borderWidth: '0',
            background: 'transparent',
            padding: '0.75rem 0.75rem',
            boxShadow: 'none',
          }}
          _focusVisible={{ ring: 'none' }}
        />

        <Flex align="center" justify="space-between" gap="3" pt="3">
          <Flex align="center" gap="2" minW="0" flex="1" flexWrap="wrap">
            <Popover.Root
              open={isAnswerModePopoverOpen}
              onOpenChange={(event) => setIsAnswerModePopoverOpen(event.open)}
            >
              <Popover.Trigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  aria-label="Select answer mode"
                  title="Select answer mode"
                  disabled={disabled}
                  h="9"
                  gap="1.5"
                  px="2.5"
                  rounded="lg"
                  color="fg.muted"
                  _hover={{ bg: 'bg.subtle', color: 'fg' }}
                >
                  <Text as="span" fontSize="xs" fontWeight="medium">
                    {responseModeLabel}
                  </Text>
                  <ChevronDown size={15} style={{ flexShrink: 0 }} />
                </Button>
              </Popover.Trigger>
              <Popover.Positioner zIndex="popover">
                <Popover.Content
                  w="22rem"
                  maxW="calc(100vw - 2rem)"
                  overflow="hidden"
                  rounded="lg"
                  borderWidth="1px"
                  borderColor="border.subtle"
                  bg="bg.surface"
                  shadow="lg"
                >
                  <Popover.Arrow>
                    <Popover.ArrowTip />
                  </Popover.Arrow>
                  <Popover.Body p="3">
                    <RadioCard.Root
                      value={responseMode}
                      colorPalette="teal"
                      gap="3"
                      orientation="vertical"
                      onValueChange={(event) => handleResponseModeChange(event.value)}
                    >
                      <RadioCard.Label fontSize="xs" fontWeight="semibold" color="fg.muted">
                        Answer mode
                      </RadioCard.Label>
                      <Group attached orientation="vertical">
                        {responseModeOptions.map((option) => (
                          <RadioCard.Item key={option.value} value={option.value} width="full">
                            <RadioCard.ItemHiddenInput />
                            <RadioCard.ItemControl
                              display="grid"
                              gridTemplateColumns="auto minmax(0, 1fr)"
                              alignItems="start"
                              columnGap="3"
                            >
                              <RadioCard.ItemIndicator mt="0.5" />
                              <RadioCard.ItemContent alignItems="flex-start" gap="1" minW="0">
                                <RadioCard.ItemText>{option.title}</RadioCard.ItemText>
                                <RadioCard.ItemDescription>
                                  {option.description}
                                </RadioCard.ItemDescription>
                              </RadioCard.ItemContent>
                            </RadioCard.ItemControl>
                          </RadioCard.Item>
                        ))}
                      </Group>
                    </RadioCard.Root>
                  </Popover.Body>
                  <Popover.CloseTrigger
                    position="absolute"
                    top="2"
                    right="2"
                    rounded="md"
                    px="2"
                    py="1"
                    fontSize="xs"
                    color="fg.muted"
                    _hover={{ bg: 'bg.subtle', color: 'fg' }}
                  >
                    Close
                  </Popover.CloseTrigger>
                </Popover.Content>
              </Popover.Positioner>
            </Popover.Root>

            {hasModelPicker ? (
              <Popover.Root
                open={isModelPopoverOpen}
                onOpenChange={(event) => setIsModelPopoverOpen(event.open)}
              >
                <Popover.Trigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    aria-label="Select model"
                    title="Select model"
                    minW="0"
                    maxW={{ base: '11rem', sm: '18rem' }}
                    h="9"
                    gap="1.5"
                    px="2.5"
                    rounded="lg"
                    color="fg.muted"
                    _hover={{ bg: 'bg.subtle', color: 'fg' }}
                  >
                    <Brain size={16} style={{ flexShrink: 0 }} />
                    <Text as="span" truncate fontSize="xs" fontWeight="medium">
                      {modelLabel}
                    </Text>
                    <ChevronDown size={15} style={{ flexShrink: 0 }} />
                  </Button>
                </Popover.Trigger>
                <Popover.Positioner zIndex="popover">
                  <Popover.Content
                    w="18rem"
                    maxW="calc(100vw - 2rem)"
                    overflow="hidden"
                    rounded="lg"
                    borderWidth="1px"
                    borderColor="border.subtle"
                    bg="bg.surface"
                    shadow="lg"
                  >
                    <Popover.Arrow>
                      <Popover.ArrowTip />
                    </Popover.Arrow>
                    <Popover.Body p="2">
                      <Popover.Title px="2" py="1.5" fontSize="xs" fontWeight="semibold" color="fg.muted">
                        Model
                      </Popover.Title>
                      {isLoadingModels ? (
                        <Text px="2" py="2" fontSize="sm" color="fg.muted">
                          Loading models...
                        </Text>
                      ) : null}
                      {modelOptions?.length ? (
                        <Flex direction="column" gap="1">
                          {modelOptions.map((model) => (
                            <chakra.button
                              key={model}
                              type="button"
                              display="flex"
                              alignItems="center"
                              justifyContent="space-between"
                              gap="3"
                              w="full"
                              rounded="md"
                              px="2"
                              py="2"
                              textAlign="left"
                              fontSize="sm"
                              fontWeight="medium"
                              color={selectedModel === model ? 'fg' : 'fg.muted'}
                              cursor="pointer"
                              _hover={{ bg: 'bg.subtle', color: 'fg' }}
                              onClick={() => selectModel(model)}
                            >
                              <Text as="span" truncate>
                                {model}
                              </Text>
                              {selectedModel === model ? <Check size={15} /> : null}
                            </chakra.button>
                          ))}
                        </Flex>
                      ) : !isLoadingModels ? (
                        <Text px="2" py="2" fontSize="sm" color="fg.muted">
                          No models available
                        </Text>
                      ) : null}
                    </Popover.Body>
                    <Popover.CloseTrigger
                      position="absolute"
                      top="1.5"
                      right="1.5"
                      rounded="md"
                      px="2"
                      py="1"
                      fontSize="xs"
                      color="fg.muted"
                      _hover={{ bg: 'bg.subtle', color: 'fg' }}
                    >
                      Close
                    </Popover.CloseTrigger>
                  </Popover.Content>
                </Popover.Positioner>
              </Popover.Root>
            ) : null}
          </Flex>

          <Button
            type="button"
            size="icon"
            aria-label="Send message"
            disabled={disabled || value.trim().length === 0}
            flexShrink="0"
            style={{ width: '2.25rem', height: '2.25rem', borderRadius: '0.5rem' }}
            onClick={submit}
          >
            <Send size={16} />
          </Button>
        </Flex>

        {modelOptionsError ? (
          <Text mt="3" px="1" fontSize="xs" color="fg.error">{modelOptionsError}</Text>
        ) : null}
      </Box>
    </Box>
  );
}
