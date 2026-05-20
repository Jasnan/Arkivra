import type { ComponentProps } from 'react';
import { Box, Flex, Menu, Portal, Text } from '@chakra-ui/react';
import { ArrowUpDown, Check, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface DocumentSortOption<TValue extends string> {
  value: TValue;
  label: string;
}

export function DocumentSortMenu<TValue extends string>({
  ariaLabel,
  buttonProps,
  iconOnlyOnMobile = false,
  labelId,
  onValueChange,
  options,
  value,
  variant = 'default',
}: {
  ariaLabel: string;
  buttonProps?: ComponentProps<typeof Button>;
  iconOnlyOnMobile?: boolean;
  labelId?: string;
  onValueChange: (value: TValue) => void;
  options: Array<DocumentSortOption<TValue>>;
  value: TValue;
  variant?: 'default' | 'toolbar';
}) {
  const isToolbar = variant === 'toolbar';
  const selectedSortLabel = options.find((option) => option.value === value)?.label ?? options[0]?.label ?? 'Sort';

  return (
    <Menu.Root positioning={{ placement: 'bottom-end', offset: { mainAxis: 6, crossAxis: 0 } }}>
      <Menu.Trigger asChild>
        <Button
          type="button"
          variant="outline"
          aria-label={ariaLabel}
          aria-labelledby={labelId}
          h={isToolbar ? '10' : 'calc(var(--arkivra-controlHeight, 2.5rem) + 0.25rem)'}
          w={isToolbar ? { base: 'full', sm: '10rem' } : 'full'}
          minW={isToolbar ? { base: '0', sm: '10rem' } : { md: '11rem' }}
          justifyContent={iconOnlyOnMobile ? { base: 'center', sm: 'space-between' } : 'space-between'}
          gap="2"
          rounded={isToolbar ? 'md' : undefined}
          borderColor={isToolbar ? 'border.surface' : 'border.strong'}
          bg="bg.surface"
          px="3"
          color="fg"
          shadow="none"
          _hover={{ borderColor: 'fg/30', bg: 'bg.surface' }}
          _focusVisible={{
            borderColor: 'teal.solid',
            outline: '2px solid',
            outlineColor: 'teal.focusRing',
            outlineOffset: '1px',
          }}
          {...buttonProps}
        >
          <Flex minW="0" align="center" gap="2">
            <Box color="fg.muted" aria-hidden="true">
              <ArrowUpDown size={16} />
            </Box>
            {labelId ? (
              <Text as="span" id={labelId} srOnly>
                Sort
              </Text>
            ) : null}
            <Text
              as="span"
              display={iconOnlyOnMobile ? { base: 'none', sm: 'inline' } : undefined}
              truncate
              fontSize="sm"
              fontWeight="medium"
            >
              {selectedSortLabel}
            </Text>
          </Flex>
          <Box
            display={iconOnlyOnMobile ? { base: 'none', sm: 'block' } : undefined}
            flexShrink={0}
            color="fg.muted"
            aria-hidden="true"
          >
            <ChevronDown size={16} />
          </Box>
        </Button>
      </Menu.Trigger>
      <Portal>
        <Menu.Positioner zIndex="dropdown">
          <Menu.Content
            minW={isToolbar ? '12rem' : '11rem'}
            rounded="lg"
            borderWidth="1px"
            borderColor="border.surface"
            bg="bg.surface"
            p="1.5"
            shadow="lg"
          >
            <Menu.RadioItemGroup
              value={value}
              onValueChange={(event) => onValueChange(event.value as TValue)}
            >
              {options.map((option) => (
                <Menu.RadioItem
                  key={option.value}
                  value={option.value}
                  position="relative"
                  minH={isToolbar ? '10' : 'var(--arkivra-menuItemMinHeight, 2.5rem)'}
                  rounded="md"
                  py={isToolbar ? '2' : 'var(--arkivra-menuItemPaddingY, 0.5rem)'}
                  ps={isToolbar ? '3' : '10'}
                  pe={isToolbar ? '10' : '3'}
                  fontSize="sm"
                  fontWeight="medium"
                  color="fg"
                  _checked={{ bg: 'teal.subtle', color: 'fg' }}
                  _highlighted={{ bg: value === option.value ? 'teal.subtle' : 'bg.subtle' }}
                >
                  <Box
                    position="absolute"
                    left={isToolbar ? undefined : '2.5'}
                    right={isToolbar ? '2.5' : undefined}
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
                  <Menu.ItemText>{option.label}</Menu.ItemText>
                </Menu.RadioItem>
              ))}
            </Menu.RadioItemGroup>
          </Menu.Content>
        </Menu.Positioner>
      </Portal>
    </Menu.Root>
  );
}
