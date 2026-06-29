import type { ComponentProps, ReactNode } from 'react';
import { Box, Flex, Menu, Portal, Text } from '@chakra-ui/react';
import { Check, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface RadioDropdownMenuOption<TValue extends string> {
  value: TValue;
  label: string;
}

export function RadioDropdownMenu<TValue extends string>({
  ariaLabel,
  buttonProps,
  hideLabel = false,
  icon,
  iconOnlyOnMobile = false,
  isDisabled = false,
  isLoading = false,
  labelId,
  loadingLabel = 'Loading...',
  onValueChange,
  options,
  triggerLabel,
  emptyLabel,
  placeholder = 'Select',
  size = 'md',
  value,
  variant = 'default',
}: {
  ariaLabel: string;
  buttonProps?: ComponentProps<typeof Button>;
  hideLabel?: boolean;
  icon?: ReactNode;
  iconOnlyOnMobile?: boolean;
  isDisabled?: boolean;
  isLoading?: boolean;
  labelId?: string;
  loadingLabel?: string;
  onValueChange: (value: TValue) => void;
  options: ReadonlyArray<RadioDropdownMenuOption<TValue>>;
  triggerLabel?: string;
  emptyLabel?: string;
  placeholder?: string;
  size?: 'sm' | 'md';
  value: TValue;
  variant?: 'default' | 'toolbar' | 'input';
}) {
  const isToolbar = variant === 'toolbar';
  const isInput = variant === 'input';
  const iconSize = size === 'sm' ? 14 : 16;
  const selectedLabel = triggerLabel ?? options.find(option => option.value === value)?.label ?? placeholder;

  return (
    <Menu.Root positioning={{ placement: 'bottom-end', gutter: 6, sameWidth: !isInput }}>
      <Menu.Trigger asChild>
        <Button
          type="button"
          variant={isInput ? 'ghost' : 'outline'}
          aria-label={ariaLabel}
          aria-labelledby={labelId}
          disabled={isDisabled}
          size={isInput ? 'xs' : isToolbar ? size : 'md'}
          w={isInput ? 'auto' : 'full'}
          justifyContent={isInput ? 'center' : iconOnlyOnMobile ? { base: 'center', sm: 'space-between' } : 'space-between'}
          gap="2"
          rounded={isInput || isToolbar ? 'md' : undefined}
          borderColor={isInput ? 'transparent' : isToolbar ? 'border.surface' : 'border.strong'}
          bg={isInput ? 'transparent' : 'bg.surface'}
          px={isInput ? { base: '0', md: '2' } : '3'}
          color="fg"
          shadow="none"
          _hover={isInput ? { bg: 'bg.subtle', color: 'fg' } : { borderColor: 'fg/30', bg: 'bg.surface' }}
          _focusVisible={{
            borderColor: 'teal.solid',
            outline: '2px solid',
            outlineColor: 'teal.focusRing',
            outlineOffset: '1px',
          }}
          {...buttonProps}
        >
          <Flex minW="0" align="center" gap="2">
            {icon ? (
              <Box color="fg.muted" aria-hidden="true">
                {icon}
              </Box>
            ) : null}
            {labelId ? (
              <Text as="span" id={labelId} srOnly>
                {placeholder}
              </Text>
            ) : null}
            <Text
              as="span"
              display={hideLabel ? 'none' : isInput ? { base: 'none', md: 'inline' } : iconOnlyOnMobile ? { base: 'none', sm: 'inline' } : undefined}
              truncate
              fontSize="sm"
              fontWeight="medium"
            >
              {selectedLabel}
            </Text>
          </Flex>
          <Box
            display={isInput ? 'none' : iconOnlyOnMobile ? { base: 'none', sm: 'block' } : undefined}
            flexShrink={0}
            color="fg.muted"
            aria-hidden="true"
          >
            <ChevronDown size={iconSize} />
          </Box>
        </Button>
      </Menu.Trigger>
      <Portal>
        <Menu.Positioner zIndex="dropdown">
          <Menu.Content
            minW={isInput ? '11rem' : undefined}
            rounded="lg"
            borderWidth="1px"
            borderColor="border.surface"
            bg="bg.surface"
            p="1.5"
            shadow="lg"
          >
            {isLoading ? (
              <Text px="3" py="var(--arkivra-menuItemPaddingY, 0.5rem)" fontSize="sm" color="fg.muted">
                {loadingLabel}
              </Text>
            ) : options.length > 0 ? (
              <Menu.RadioItemGroup
                value={value}
                onValueChange={(event) => {
                  if (event.value) {
                    onValueChange(event.value as TValue);
                  }
                }}
              >
                {options.map(option => (
                  <Menu.RadioItem
                    key={option.value}
                    value={option.value}
                    position="relative"
                    minH={isToolbar ? '10' : 'var(--arkivra-menuItemMinHeight, 2.5rem)'}
                    rounded="md"
                    py={isToolbar ? '2' : 'var(--arkivra-menuItemPaddingY, 0.5rem)'}
                    ps="3"
                    pe="10"
                    fontSize="sm"
                    fontWeight="medium"
                    color="fg"
                    borderWidth="1px"
                    borderColor={value === option.value ? 'teal.muted' : 'transparent'}
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
                    <Menu.ItemText>{option.label}</Menu.ItemText>
                  </Menu.RadioItem>
                ))}
              </Menu.RadioItemGroup>
            ) : emptyLabel ? (
              <Text px="3" py="var(--arkivra-menuItemPaddingY, 0.5rem)" fontSize="sm" color="fg.muted">
                {emptyLabel}
              </Text>
            ) : null}
          </Menu.Content>
        </Menu.Positioner>
      </Portal>
    </Menu.Root>
  );
}
