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
  emptyLabel,
  placeholder = 'Select',
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
  emptyLabel?: string;
  placeholder?: string;
  value: TValue;
  variant?: 'default' | 'toolbar' | 'input';
}) {
  const isToolbar = variant === 'toolbar';
  const isInput = variant === 'input';
  const selectedLabel = options.find(option => option.value === value)?.label ?? placeholder;

  return (
    <Menu.Root positioning={{ placement: 'bottom-end', gutter: 6, sameWidth: !isInput }}>
      <Menu.Trigger asChild>
        <Button
          type="button"
          variant={isInput ? 'ghost' : 'outline'}
          aria-label={ariaLabel}
          aria-labelledby={labelId}
          disabled={isDisabled}
          h={isInput ? '8' : isToolbar ? '10' : 'calc(var(--arkivra-controlHeight, 2.5rem) + 0.25rem)'}
          minH={isInput ? '8' : undefined}
          w={isInput ? '8' : isToolbar ? { base: 'full', sm: '10rem' } : 'full'}
          minW={isInput ? '8' : isToolbar ? { base: '0', sm: '10rem' } : { md: '11rem' }}
          justifyContent={isInput ? 'center' : iconOnlyOnMobile ? { base: 'center', sm: 'space-between' } : 'space-between'}
          gap="2"
          rounded={isInput || isToolbar ? 'md' : undefined}
          borderColor={isInput ? 'transparent' : isToolbar ? 'border.surface' : 'border.strong'}
          bg={isInput ? 'transparent' : 'bg.surface'}
          px={isInput ? '0' : '3'}
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
              display={isInput || hideLabel ? 'none' : iconOnlyOnMobile ? { base: 'none', sm: 'inline' } : undefined}
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
            <ChevronDown size={16} />
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
                    _checked={{ bg: 'teal.subtle', color: 'fg' }}
                    _highlighted={{ bg: value === option.value ? 'teal.subtle' : 'bg.subtle' }}
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
