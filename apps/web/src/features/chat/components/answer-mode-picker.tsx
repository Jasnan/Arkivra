import { Box, Group, Popover, RadioCard, Text } from '@chakra-ui/react';
import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
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

export function AnswerModePicker({
  disabled,
  value,
  onValueChange,
  triggerWidth,
}: {
  disabled?: boolean;
  value: ChatResponseMode;
  onValueChange: (nextValue: ChatResponseMode) => void;
  triggerWidth?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const label = responseModeOptions.find((option) => option.value === value)?.title ?? 'Answer mode';

  function handleValueChange(nextValue: string | null) {
    if (nextValue === 'multimodal' || nextValue === 'text') {
      onValueChange(nextValue);
      setIsOpen(false);
    }
  }

  return (
    <Popover.Root open={isOpen} onOpenChange={(event) => setIsOpen(event.open)}>
      <Popover.Trigger asChild>
        <Button
          type="button"
          variant={triggerWidth ? 'outline' : 'ghost'}
          aria-label="Select answer mode"
          title="Select answer mode"
          disabled={disabled}
          size={triggerWidth ? 'md' : 'sm'}
          w={triggerWidth}
          minW="0"
          justifyContent={triggerWidth ? 'space-between' : 'center'}
          gap="1.5"
          rounded={triggerWidth ? 'md' : 'lg'}
          borderColor="border.surface"
          bg={triggerWidth ? 'bg.surface' : undefined}
          color={triggerWidth ? 'fg' : 'fg.muted'}
          shadow="none"
          _hover={triggerWidth ? { borderColor: 'fg/30', bg: 'bg.surface' } : { bg: 'bg.subtle', color: 'fg' }}
          _focusVisible={{
            borderColor: 'teal.solid',
            outline: '2px solid',
            outlineColor: 'teal.focusRing',
            outlineOffset: '1px',
          }}
        >
          <Text as="span" truncate fontSize={triggerWidth ? 'sm' : 'xs'} fontWeight="medium">
            {label}
          </Text>
          <Box flexShrink={0} color="fg.muted" aria-hidden="true">
            <ChevronDown size={15} />
          </Box>
        </Button>
      </Popover.Trigger>
      <Popover.Positioner zIndex="popover">
        <Popover.Content
          w="22rem"
          maxW="calc(100vw - 2rem)"
          overflow="hidden"
          rounded="lg"
          borderWidth="1px"
          borderColor="border.surface"
          bg="bg.surface"
          shadow="lg"
        >
          <Popover.Arrow>
            <Popover.ArrowTip />
          </Popover.Arrow>
          <Popover.Body p="3">
            <RadioCard.Root
              value={value}
              colorPalette="teal"
              gap="3"
              orientation="vertical"
              onValueChange={(event) => handleValueChange(event.value)}
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
                        <RadioCard.ItemDescription>{option.description}</RadioCard.ItemDescription>
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
  );
}
