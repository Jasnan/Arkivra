import { useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Box,
  CloseButton,
  Combobox,
  Drawer,
  Flex,
  IconButton,
  Popover,
  Portal,
  Stack,
  Text,
  chakra,
  createListCollection,
  useBreakpointValue,
} from '@chakra-ui/react';
import { Filter, Search as SearchIcon, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { DocumentSortMenu } from '@/features/documents/components/document-sort-menu';
import type { DocumentSortOption } from '@/features/documents/components/document-sort-menu';

export type DocumentSearchControlOption<TValue extends string> = DocumentSortOption<TValue>;

export interface DocumentSearchControlFilter {
  key: string;
  label: string;
  onRemove: () => void;
}

type FilterSurface = 'drawer' | 'popover';
const FILTER_ID_SEPARATOR = /\s+/g;

export interface SearchFilterMultiSelectOption {
  value: string;
  label: string;
  color?: string | null;
  meta?: string;
}

export function ActiveFilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <chakra.button
      type="button"
      display="flex"
      alignItems="center"
      gap="2"
      rounded="md"
      borderWidth="1px"
      borderColor="border.surface"
      bg="bg.subtle"
      px="3"
      py="1.5"
      fontSize="sm"
      fontWeight="medium"
      color="fg"
      transition="colors"
      _hover={{ borderColor: 'teal.subtle', bg: 'bg.subtle' }}
      onClick={onRemove}
    >
      <Text as="span">{label}</Text>
      <X size={16} />
    </chakra.button>
  );
}

export function SearchFilterMultiSelect({
  label,
  triggerLabel,
  triggerAriaLabel,
  searchLabel,
  searchPlaceholder,
  emptyLabel,
  loadingLabel,
  options,
  selectedValues,
  isLoading = false,
  onValueChange,
  onClear,
  showColorSwatch = false,
  hideLabel = false,
  controlSize = 'default',
}: {
  label: string;
  triggerLabel: string;
  triggerAriaLabel: string;
  searchLabel: string;
  searchPlaceholder: string;
  emptyLabel: string;
  loadingLabel: string;
  options: SearchFilterMultiSelectOption[];
  selectedValues: string[];
  isLoading?: boolean;
  onValueChange: (values: string[]) => void;
  onClear: () => void;
  showColorSwatch?: boolean;
  hideLabel?: boolean;
  controlSize?: 'default' | 'toolbar';
}) {
  const [inputValue, setInputValue] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const searchInputId = `${triggerAriaLabel.toLowerCase().replace(FILTER_ID_SEPARATOR, '-')}-search`;
  const normalizedInputValue = inputValue.trim().toLowerCase();
  const filteredOptions = useMemo(
    () => normalizedInputValue.length === 0
      ? options
      : options.filter((option) => option.label.toLowerCase().includes(normalizedInputValue)),
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

  function clearSelection() {
    setInputValue('');
    setIsOpen(false);
    onClear();
  }

  return (
    <Box>
      <Combobox.Root
        multiple
        openOnClick
        closeOnSelect
        collection={collection}
        inputValue={inputValue}
        open={isOpen}
        value={selectedValues}
        onInputValueChange={(details) => setInputValue(details.inputValue)}
        onOpenChange={(details) => setIsOpen(details.open)}
        onValueChange={(details) => {
          onValueChange(details.value);
          setInputValue('');
          setIsOpen(false);
        }}
        positioning={{ sameWidth: true, strategy: 'fixed', hideWhenDetached: true }}
      >
        <Combobox.Label srOnly={hideLabel} fontSize="sm" fontWeight="semibold" color="fg">
          {label}
        </Combobox.Label>

        <Combobox.Control mt={hideLabel ? '0' : '3'}>
          <Combobox.Input
            id={searchInputId}
            aria-label={triggerAriaLabel}
            aria-describedby={`${searchInputId}-hint`}
            placeholder={triggerLabel}
            h="var(--arkivra-controlHeight, 2.5rem)"
            rounded={controlSize === 'toolbar' ? 'md' : 'xl'}
            borderColor="border.surface"
            bg="bg.surface"
            px="var(--arkivra-controlPaddingX, 0.75rem)"
            pr={selectedValues.length > 0 ? '16' : '10'}
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
            {selectedValues.length > 0 ? (
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

        <Combobox.Positioner zIndex="dropdown" pointerEvents="auto">
            <Combobox.Content
              maxH="72"
              overflowY="auto"
              pointerEvents="auto"
              rounded="lg"
              borderWidth="1px"
              borderColor="border.surface"
              bg="bg.surface"
              p={controlSize === 'toolbar' ? '1.5' : '2'}
              shadow="lg"
            >
            {isLoading ? (
              <Text px="3" py="var(--arkivra-rowPaddingY, 0.875rem)" fontSize="sm" color="fg.muted">
                {loadingLabel}
              </Text>
            ) : (
              <>
                {selectedValues.length > 0 ? (
                  <chakra.button
                    type="button"
                    display="flex"
                    w="full"
                    alignItems="center"
                    gap="2"
                    minH={controlSize === 'toolbar' ? 'var(--arkivra-menuItemMinHeight, 2.5rem)' : undefined}
                    rounded="md"
                    px={controlSize === 'toolbar' ? '3' : '3'}
                    pr={controlSize === 'toolbar' ? '10' : '3'}
                    py="var(--arkivra-menuItemPaddingY, 0.5rem)"
                    fontSize="sm"
                    fontWeight="medium"
                    color={controlSize === 'toolbar' ? 'fg' : 'fg.muted'}
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
                  const isSelected = selectedValues.includes(option.value);

                  return (
                    <Combobox.Item
                      key={option.value}
                      item={option}
                      display="flex"
                      alignItems="center"
                      gap="3"
                      minH={controlSize === 'toolbar' ? 'var(--arkivra-menuItemMinHeight, 2.5rem)' : undefined}
                      rounded="md"
                      bg={controlSize === 'toolbar' && isSelected ? 'teal.subtle' : undefined}
                      px={controlSize === 'toolbar' ? '3' : '3'}
                      pr={controlSize === 'toolbar' ? '10' : '3'}
                      py="var(--arkivra-menuItemPaddingY, 0.5rem)"
                      position="relative"
                      fontSize="sm"
                      fontWeight="medium"
                      color={controlSize === 'toolbar' ? 'fg' : 'fg.muted'}
                      _highlighted={{
                        bg: controlSize === 'toolbar' && isSelected ? 'teal.subtle' : 'bg.subtle',
                        color: 'fg',
                      }}
                    >
                      {controlSize === 'toolbar' ? (
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
                          <Combobox.ItemIndicator />
                        </Box>
                      ) : null}
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
                          <Text truncate>{option.label}</Text>
                        </Combobox.ItemText>
                      </Flex>
                      {option.meta ? (
                        <Text ml="auto" fontSize="xs" color="fg.muted">
                          {option.meta}
                        </Text>
                      ) : null}
                      {controlSize !== 'toolbar' ? (
                        <Combobox.ItemIndicator color="teal.solid" />
                      ) : null}
                    </Combobox.Item>
                  );
                })}
              </>
            )}
          </Combobox.Content>
        </Combobox.Positioner>
      </Combobox.Root>
      <Text srOnly>
        {searchLabel}
      </Text>
      <Text id={`${searchInputId}-hint`} srOnly>
        {searchPlaceholder}
      </Text>
    </Box>
  );
}

export function DocumentSearchControls<TSortValue extends string>({
  query,
  onQueryChange,
  searchPlaceholder,
  searchAriaLabel,
  isFiltersOpen,
  onOpenFilters,
  onCloseFilters,
  onResetFilters,
  activeFilterCount,
  activeFilters,
  onClearFilters,
  sortBy,
  onSortChange,
  sortOptions,
  sortSelectId,
  sortAriaLabel,
  filtersTitle,
  filtersDescription,
  filtersContent,
  trailingAccessory,
  toolbarAccessory,
  layout = 'panel',
  title,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  searchPlaceholder: string;
  searchAriaLabel: string;
  isFiltersOpen: boolean;
  onOpenFilters: () => void;
  onCloseFilters: () => void;
  onResetFilters: () => void;
  activeFilterCount: number;
  activeFilters: DocumentSearchControlFilter[];
  onClearFilters: () => void;
  sortBy: TSortValue;
  onSortChange: (value: TSortValue) => void;
  sortOptions: Array<DocumentSearchControlOption<TSortValue>>;
  sortSelectId: string;
  sortAriaLabel: string;
  filtersTitle: string;
  filtersDescription?: string;
  filtersContent: ReactNode;
  trailingAccessory?: ReactNode;
  toolbarAccessory?: ReactNode;
  layout?: 'panel' | 'workspace' | 'shell';
  title?: string;
}) {
  const isWorkspaceLayout = layout === 'workspace' || layout === 'shell';
  const isShellLayout = layout === 'shell';
  const hasToolbarAccessory = Boolean(toolbarAccessory);
  const filterSurface = useBreakpointValue<FilterSurface>(
    { base: 'drawer', md: 'popover' },
    { fallback: 'md' },
  ) ?? 'popover';
  const filterTriggerRef = useRef<HTMLButtonElement | null>(null);
  function handleFiltersOpenChange(open: boolean) {
    if (open) {
      onOpenFilters();
      return;
    }

    onCloseFilters();
    window.setTimeout(() => filterTriggerRef.current?.focus(), 0);
  }

  function renderFilterButton() {
    return (
      <IconButton
        type="button"
        ref={filterTriggerRef}
        aria-label={activeFilterCount > 0 ? `Open filters, ${activeFilterCount} active` : 'Open filters'}
        variant="ghost"
        size="sm"
        position="relative"
        h="8"
        minW="8"
        rounded="md"
        color={activeFilterCount > 0 ? 'teal.solid' : 'fg.muted'}
        transition="background-color 120ms ease, color 120ms ease"
        _hover={{ bg: 'bg.subtle', color: 'fg' }}
        _focusVisible={{ outline: '2px solid', outlineColor: 'teal.solid', outlineOffset: '2px' }}
      >
        <Filter size={18} />
        {activeFilterCount > 0 ? (
          <Text
            as="span"
            position="absolute"
            top="-1"
            right="-1.5"
            display="inline-flex"
            minW="4.5"
            h="4.5"
            alignItems="center"
            justifyContent="center"
            rounded="full"
            bg="teal.solid"
            px="1"
            fontSize="0.625rem"
            fontWeight="bold"
            lineHeight="1"
            color="fg.inverted"
          >
            {activeFilterCount}
          </Text>
        ) : null}
      </IconButton>
    );
  }

  function renderFilterContent() {
    return (
      <Stack gap="4">
        {filtersContent}
      </Stack>
    );
  }

  return (
    <>
      <Box
        rounded={isWorkspaceLayout ? '0' : 'lg'}
        borderWidth={isWorkspaceLayout ? '0' : '1px'}
        borderBottomWidth={layout === 'workspace' ? '1px' : undefined}
        borderColor="border.surface"
        bg={isWorkspaceLayout ? 'bg.workspace' : 'bg.surface'}
        px={isWorkspaceLayout ? { base: '4', lg: '6' } : undefined}
        py={isShellLayout ? '2' : isWorkspaceLayout ? '3' : undefined}
        p={isWorkspaceLayout ? undefined : { base: '3', sm: '4' }}
      >
        <Flex direction={{ base: 'column', md: 'row' }} align={{ md: 'center' }} gap="3">
          {title ? (
            <Text minW={{ md: '4.5rem' }} flexShrink={0} fontWeight="semibold" color="fg">
              {title}
            </Text>
          ) : null}
          <Flex
            minW="0"
            w={{ base: 'full', md: 'auto' }}
            flex={{ md: title ? '1 1 auto' : undefined }}
            direction={{ base: 'column', md: 'row' }}
            align={{ md: 'center' }}
            justify={{ md: title ? 'flex-end' : 'flex-start' }}
            gap="3"
          >
          <Field
            minW="0"
            w="full"
            maxW={isShellLayout ? { md: '28rem' } : hasToolbarAccessory ? undefined : { md: 'none', '2xl': '64rem' }}
            flex={{ md: isShellLayout ? '0 1 28rem' : hasToolbarAccessory ? '2 1 0' : '1 1 auto' }}
          >
            <FieldLabel htmlFor="document-search-query" srOnly>
              {searchAriaLabel}
            </FieldLabel>
            <Box position="relative">
              <Box
                position="absolute"
                left="4"
                top="50%"
                transform="translateY(-50%)"
                color="fg.muted"
                pointerEvents="none"
              >
                <SearchIcon size={16} />
              </Box>
              <Input
                id="document-search-query"
                aria-label={searchAriaLabel}
                value={query}
                onChange={(event) => onQueryChange(event.target.value)}
                placeholder={searchPlaceholder}
                h="11"
                borderColor="border.strong"
                bg="bg.surface"
                pl="11"
                pr="14"
                _hover={{ borderColor: 'fg/30' }}
                _focusVisible={{
                  borderColor: 'teal.solid',
                  outline: '2px solid',
                  outlineColor: 'teal.focusRing',
                  outlineOffset: '1px',
                }}
              />
              <Box position="absolute" right="2" top="50%" transform="translateY(-50%)">
                {filterSurface === 'drawer' ? (
                  <Drawer.Root
                    open={isFiltersOpen}
                    onOpenChange={(event) => handleFiltersOpenChange(event.open)}
                    modal={false}
                    placement="bottom"
                    size="full"
                  >
                    <Drawer.Trigger asChild>
                      {renderFilterButton()}
                    </Drawer.Trigger>
                    <Portal>
                      <Drawer.Backdrop bg="blackAlpha.500" />
                      <Drawer.Positioner>
                        <Drawer.Content maxH="86vh" roundedTop="xl" bg="bg.surface">
                          <Drawer.Header borderBottomWidth="1px" borderColor="border.surface" px="5" py="4">
                            <Flex w="full" align="center" justify="space-between" gap="4">
                              <Box minW="0">
                                <Drawer.Title fontSize="lg" fontWeight="semibold">
                                  {filtersTitle}
                                </Drawer.Title>
                                <Drawer.Description srOnly>
                                  {filtersDescription ?? 'Adjust filters.'}
                                </Drawer.Description>
                              </Box>

                              <Flex shrink={0} align="center" gap="3">
                                <chakra.button
                                  type="button"
                                  fontSize="sm"
                                  fontWeight="medium"
                                  color="teal.solid"
                                  textDecoration="underline"
                                  textUnderlineOffset="4"
                                  transition="colors"
                                  _hover={{ opacity: 0.8 }}
                                  onClick={onResetFilters}
                                >
                                  Reset
                                </chakra.button>
                                <Drawer.CloseTrigger asChild>
                                  <CloseButton size="sm" aria-label="Close filters" />
                                </Drawer.CloseTrigger>
                              </Flex>
                            </Flex>
                          </Drawer.Header>

                          <Drawer.Body px="5" py="4" overflowY="auto">
                            {renderFilterContent()}
                          </Drawer.Body>

                          <Drawer.Footer borderTopWidth="1px" borderColor="border.surface" px="5" py="4">
                            <Button type="button" w="full" onClick={onCloseFilters}>
                              Show results
                            </Button>
                          </Drawer.Footer>
                        </Drawer.Content>
                      </Drawer.Positioner>
                    </Portal>
                  </Drawer.Root>
                ) : (
                  <Popover.Root
                    open={isFiltersOpen}
                    onOpenChange={(event) => handleFiltersOpenChange(event.open)}
                    modal={false}
                    size="xs"
                    positioning={{ placement: 'bottom-end', offset: { mainAxis: 8, crossAxis: 0 } }}
                  >
                    <Popover.Trigger asChild>
                      {renderFilterButton()}
                    </Popover.Trigger>
                    <Portal>
                      <Popover.Positioner zIndex="popover">
                        <Popover.Content
                          w="24rem"
                          maxW="calc(100vw - 2rem)"
                          maxH="calc(100vh - 6rem)"
                          overflow="hidden"
                          rounded="lg"
                          borderWidth="1px"
                          borderColor="border.surface"
                          bg="bg.surface"
                          shadow="xl"
                        >
                          <Popover.Arrow>
                            <Popover.ArrowTip />
                          </Popover.Arrow>
                          <Popover.Body maxH="calc(100vh - 8rem)" overflowY="auto" p="5">
                            <Stack gap="4">
                              <Flex align="center" justify="space-between" gap="4">
                                <Box minW="0">
                                  <Popover.Title fontWeight="medium">
                                    {filtersTitle}
                                  </Popover.Title>
                                  <Popover.Description srOnly>
                                    {filtersDescription ?? 'Adjust filters.'}
                                  </Popover.Description>
                                </Box>

                                <Flex shrink={0} align="center" gap="2">
                                  <chakra.button
                                    type="button"
                                    fontSize="sm"
                                    fontWeight="medium"
                                    color="teal.solid"
                                    textDecoration="underline"
                                    textUnderlineOffset="4"
                                    transition="colors"
                                    _hover={{ opacity: 0.8 }}
                                    onClick={onResetFilters}
                                  >
                                    Reset
                                  </chakra.button>
                                  <Popover.CloseTrigger asChild>
                                    <CloseButton size="sm" aria-label="Close filters" />
                                  </Popover.CloseTrigger>
                                </Flex>
                              </Flex>

                              {renderFilterContent()}
                            </Stack>
                          </Popover.Body>
                        </Popover.Content>
                      </Popover.Positioner>
                    </Portal>
                  </Popover.Root>
                )}
              </Box>
            </Box>
          </Field>

          <Flex
            direction={{ base: 'column', sm: 'row' }}
            gap="3"
            minW="0"
            w={isShellLayout ? { base: 'full', md: 'auto' } : 'full'}
            flex={{ md: isShellLayout ? '0 0 auto' : hasToolbarAccessory ? '1 1 0' : '0 0 auto' }}
            shrink={hasToolbarAccessory ? 1 : 0}
          >
            <DocumentSortMenu
              ariaLabel={sortAriaLabel}
              buttonProps={{
                h: isShellLayout ? '11' : undefined,
                minH: isShellLayout ? '11' : undefined,
                minW: isShellLayout ? { base: '0', sm: '10rem' } : hasToolbarAccessory ? '0' : { md: '11rem' },
              }}
              labelId={sortSelectId}
              value={sortBy}
              onValueChange={onSortChange}
              options={sortOptions}
              variant={isShellLayout ? 'toolbar' : 'default'}
            />
          </Flex>

          {toolbarAccessory || trailingAccessory ? (
            <Flex
              minW="0"
              w={isShellLayout ? { base: 'full', md: 'auto' } : 'full'}
              flex={{ md: isShellLayout ? '0 0 auto' : '1 1 0' }}
              align="center"
              justify="flex-start"
              gap="2"
            >
              {toolbarAccessory}
              {trailingAccessory}
            </Flex>
          ) : null}
          </Flex>
        </Flex>

        {activeFilters.length > 0 ? (
          <>
            <Separator mt="4" />
            <Flex
              direction={{ base: 'column', sm: 'row' }}
              alignItems={{ sm: 'center' }}
              justifyContent={{ sm: 'space-between' }}
              gap="3"
              pt="4"
            >
              <Flex flexWrap="wrap" align="center" gap="2">
                <Text as="span" fontSize="sm" fontWeight="semibold" color="fg.muted">
                  Active filters:
                </Text>
                {activeFilters.map((filter) => (
                  <ActiveFilterChip
                    key={filter.key}
                    label={filter.label}
                    onRemove={filter.onRemove}
                  />
                ))}
              </Flex>

              <chakra.button
                type="button"
                fontSize="sm"
                fontWeight="medium"
                color="teal.solid"
                textDecoration="underline"
                textUnderlineOffset="4"
                transition="colors"
                _hover={{ opacity: 0.8 }}
                textAlign="left"
                onClick={onClearFilters}
              >
                Clear all
              </chakra.button>
            </Flex>
          </>
        ) : null}
      </Box>
    </>
  );
}
