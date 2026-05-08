import type { RefObject } from 'react';
import { useEffect } from 'react';
import { Box, Flex, Text } from '@chakra-ui/react';
import { Send, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Textarea } from '@/components/ui/textarea';
import type { ChatResponseMode } from '../chat.api';

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
  const showSources = responseMode === 'multimodal';
  const hasModelPicker = Boolean(onSelectedModelChange);

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

  return (
    <Box alignSelf="end" flexShrink="0" px="4" pb="4" pt="2" sm={{ px: '6', pb: '5' }}>
      <Box
        mx="auto"
        w="100%"
        maxW="72rem"
        rounded="2xl"
        borderWidth="1px"
        borderColor="border.subtle"
        bg="bg.panel"
        p="3"
        boxShadow="0 10px 30px rgba(15,23,42,0.05)"
      >
        <Flex gap="3">
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
              flex: 1,
              resize: 'none',
              borderWidth: '0',
              background: 'transparent',
              padding: '0.75rem 0.75rem',
              boxShadow: 'none',
            }}
            _focusVisible={{ ring: 'none' }}
          />
          <Flex gap="1">
            <Button
              type="button"
              size="icon"
              aria-label="Send message"
              disabled={disabled || value.trim().length === 0}
              style={{ width: '2.75rem', height: '2.75rem', borderRadius: '0.75rem' }}
              onClick={submit}
            >
              <Send size={16} />
            </Button>
            {hasModelPicker ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Chat options"
                    style={{ width: '2.75rem', height: '2.75rem', borderRadius: '0.75rem' }}
                  >
                    <SlidersHorizontal size={16} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" minW="56">
                  <DropdownMenuCheckboxItem
                    checked={showSources}
                    onCheckedChange={(checked) => onResponseModeChange(checked ? 'multimodal' : 'text')}
                  >
                    Show sources
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuSeparator />
                  {(modelOptions ?? []).map((model) => (
                    <DropdownMenuCheckboxItem
                      key={model}
                      checked={selectedModel === model}
                      onCheckedChange={() => onSelectedModelChange?.(model)}
                    >
                      {model}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </Flex>
        </Flex>

        {modelOptionsError ? (
          <Text mt="3" px="1" fontSize="xs" color="fg.error">{modelOptionsError}</Text>
        ) : null}
      </Box>
    </Box>
  );
}
