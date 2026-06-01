import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import {
  Box,
  CloseButton,
  Combobox,
  Flex,
  Portal,
  Stack,
  Text,
  chakra,
  createListCollection,
} from '@chakra-ui/react';
import { Check } from 'lucide-react';

const WHITESPACE_PATTERN = /\s+/g;

export interface SearchComboboxOption {
  value: string;
  label: string;
  color?: string | null;
  meta?: string;
}

export function SearchCombobox({
  label,
  inputId,
  ariaLabel,
  value,
  options,
  onValueChange,
  placeholder,
  searchPlaceholder,
  emptyLabel,
  loadingLabel,
  isLoading = false,
  multiple = false,
  hideLabel = false,
  controlSize = 'default',
  controlBg,
  contentBg,
  showColorSwatch = false,
  renderOption,
}: {
  label: string;
  inputId?: string;
  ariaLabel?: string;
  value: string[];
  options: SearchComboboxOption[];
  onValueChange: (value: string[]) => void;
  placeholder: string;
  searchPlaceholder?: string;
  emptyLabel: string;
  loadingLabel?: string;
  isLoading?: boolean;
  multiple?: boolean;
  hideLabel?: boolean;
  controlSize?: 'default' | 'toolbar';
  controlBg?: string;
  contentBg?: string;
  showColorSwatch?: boolean;
  renderOption?: (option: SearchComboboxOption) => ReactNode;
}) {
  const [inputValue, setInputValue] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const normalizedInputValue = inputValue.trim().toLowerCase();
  const selectedOptions = useMemo(
    () => options.filter((option) => value.includes(option.value)),
    [options, value],
  );
  const filteredOptions = useMemo(
    () => normalizedInputValue.length === 0
      ? options
      : options.filter((option) => (
        option.label.toLowerCase().includes(normalizedInputValue)
        || option.value.toLowerCase().includes(normalizedInputValue)
        || option.meta?.toLowerCase().includes(normalizedInputValue)
      )),
    [normalizedInputValue, options],
  );
  const collection = useMemo(
    () => createListCollection({
      items: filteredOptions,
      itemToString: (item) => item.label,
      itemToValue: (item) => item.value,
    }),
    [filteredOptions],
  );
  const selectedLabel = selectedOptions.length === 1
    ? selectedOptions[0]?.label
    : selectedOptions.length > 1
      ? `${selectedOptions.length} selected`
      : undefined;
  const inputPlaceholder = inputValue.length > 0 ? searchPlaceholder ?? placeholder : selectedLabel ?? placeholder;

  function clearSelection() {
    setInputValue('');
    setIsOpen(false);
    onValueChange([]);
  }

  return (
    <Box>
      <Combobox.Root
        multiple={multiple}
        openOnClick
        closeOnSelect
        collection={collection}
        inputValue={inputValue}
        open={isOpen}
        value={value}
        onInputValueChange={(details) => setInputValue(details.inputValue)}
        onOpenChange={(details) => setIsOpen(details.open)}
        onValueChange={(details) => {
          onValueChange(multiple ? details.value : details.value.slice(0, 1));
          setInputValue('');
          if (!multiple) {
            setIsOpen(false);
          }
        }}
        positioning={{ sameWidth: true, strategy: 'fixed', hideWhenDetached: true }}
      >
        <Combobox.Label srOnly={hideLabel} fontSize="sm" fontWeight="semibold" color="fg">
          {label}
        </Combobox.Label>

        <Combobox.Control mt={hideLabel ? '0' : '3'}>
          <Combobox.Input
            id={inputId}
            aria-label={ariaLabel ?? `Filter by ${label.toLowerCase()}`}
            aria-describedby={`${label.toLowerCase().replace(WHITESPACE_PATTERN, '-')}-combobox-hint`}
            placeholder={inputPlaceholder}
            h="var(--arkivra-controlHeight, 2.5rem)"
            rounded={controlSize === 'toolbar' ? 'md' : 'xl'}
            borderColor="border.surface"
            bg={controlBg ?? 'bg.surface'}
            px="var(--arkivra-controlPaddingX, 0.75rem)"
            pr={value.length > 0 ? '16' : '10'}
            fontSize="sm"
            fontWeight={controlSize === 'toolbar' ? 'medium' : undefined}
            shadow="none"
            _hover={{ borderColor: controlSize === 'toolbar' ? 'fg/30' : undefined }}
            _focusVisible={{
              borderColor: controlSize === 'toolbar' ? 'teal.solid' : undefined,
              outline: controlSize === 'toolbar' ? '2px solid' : undefined,
              outlineColor: controlSize === 'toolbar' ? 'teal.focusRing' : undefined,
              outlineOffset: controlSize === 'toolbar' ? '1px' : undefined,
            }}
          />
          <Combobox.IndicatorGroup>
            {value.length > 0 ? (
              <CloseButton
                size="xs"
                variant="plain"
                aria-label={`Clear ${label.toLowerCase()} filter`}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  clearSelection();
                }}
              />
            ) : null}
            <Combobox.Trigger />
          </Combobox.IndicatorGroup>
        </Combobox.Control>

        <Portal>
          <Combobox.Positioner zIndex="dropdown" pointerEvents="auto">
            <Combobox.Content
              maxH="72"
              overflowY="auto"
              pointerEvents="auto"
              rounded="lg"
              borderWidth="1px"
              borderColor="border.surface"
              bg={contentBg ?? 'bg.surface'}
              p="1.5"
              shadow="lg"
            >
              {isLoading ? (
                <Text px="3" py="var(--arkivra-rowPaddingY, 0.875rem)" fontSize="sm" color="fg.muted">
                  {loadingLabel ?? 'Loading...'}
                </Text>
              ) : (
                <>
                  {value.length > 0 ? (
                    <chakra.button
                      type="button"
                      display="flex"
                      w="full"
                      alignItems="center"
                      gap="2"
                      minH="var(--arkivra-menuItemMinHeight, 2.5rem)"
                      rounded="md"
                      px="3"
                      pr="10"
                      py="var(--arkivra-menuItemPaddingY, 0.5rem)"
                      fontSize="sm"
                      fontWeight="medium"
                      color="fg"
                      textAlign="left"
                      position="relative"
                      transition="background-color 120ms ease, color 120ms ease"
                      _hover={{ bg: 'bg.subtle', color: 'fg' }}
                      onClick={clearSelection}
                    >
                      All {label.toLowerCase()}
                    </chakra.button>
                  ) : null}

                  <Combobox.Empty px="3" py="var(--arkivra-rowPaddingY, 0.875rem)" fontSize="sm" color="fg.muted">
                    {emptyLabel}
                  </Combobox.Empty>

                  {collection.items.map((option) => {
                    const isSelected = value.includes(option.value);

                    return (
                      <Combobox.Item
                        key={option.value}
                        item={option}
                        display="flex"
                        alignItems="center"
                        gap="3"
                        minH="var(--arkivra-menuItemMinHeight, 2.5rem)"
                        rounded="md"
                        bg={isSelected ? 'teal.subtle' : undefined}
                        px="3"
                        pr="10"
                        py="var(--arkivra-menuItemPaddingY, 0.5rem)"
                        position="relative"
                        fontSize="sm"
                        fontWeight="medium"
                        color="fg"
                        _highlighted={{
                          bg: isSelected ? 'teal.subtle' : 'bg.subtle',
                          color: 'fg',
                        }}
                      >
                        <Box
                          position="absolute"
                          right="2.5"
                          top="50%"
                          display="flex"
                          boxSize="5"
                          alignItems="center"
                          justifyContent="center"
                          color="teal.solid"
                          transform="translateY(-50%)"
                        >
                          <Combobox.ItemIndicator>
                            <Check size={16} strokeWidth={2.5} />
                          </Combobox.ItemIndicator>
                        </Box>
                        {renderOption ? (
                          renderOption(option)
                        ) : (
                          <Flex minW="0" flex="1" align="center" gap="3">
                            {showColorSwatch ? (
                              <Box
                                boxSize="2.5"
                                rounded="full"
                                bg={option.color ?? 'fg.muted'}
                                aria-hidden="true"
                              />
                            ) : null}
                            <Combobox.ItemText asChild>
                              <Stack gap="0" minW="0">
                                <Text truncate>{option.label}</Text>
                                {option.meta ? (
                                  <Text textStyle="xs" color="fg.muted" truncate>
                                    {option.meta}
                                  </Text>
                                ) : null}
                              </Stack>
                            </Combobox.ItemText>
                          </Flex>
                        )}
                      </Combobox.Item>
                    );
                  })}
                </>
              )}
            </Combobox.Content>
          </Combobox.Positioner>
        </Portal>
      </Combobox.Root>
      <Text id={`${label.toLowerCase().replace(WHITESPACE_PATTERN, '-')}-combobox-hint`} srOnly>
        {searchPlaceholder ?? placeholder}
      </Text>
    </Box>
  );
}
