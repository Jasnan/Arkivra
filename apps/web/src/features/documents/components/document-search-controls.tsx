import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Box,
  CloseButton,
  Dialog,
  Flex,
  HStack,
  IconButton,
  Portal,
  Stack,
  Text,
  chakra,
} from '@chakra-ui/react';
import { Filter, Search as SearchIcon, X } from 'lucide-react';
import { WorkspacePageTitle } from '@/components/layout/workspace-page-title';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { SearchCombobox } from '@/components/ui/search-combobox';
import { Separator } from '@/components/ui/separator';
import { DocumentSortMenu } from '@/features/documents/components/document-sort-menu';
import type { DocumentSortOption } from '@/features/documents/components/document-sort-menu';

export type DocumentSearchControlOption<TValue extends string> = DocumentSortOption<TValue>;

export interface DocumentSearchControlFilter {
  key: string;
  label: string;
  onRemove: () => void;
}

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
  controlBg,
  contentBg,
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
  controlBg?: string;
  contentBg?: string;
}) {
  return (
    <SearchCombobox
      label={label}
      placeholder={triggerLabel}
      searchPlaceholder={searchPlaceholder}
      emptyLabel={emptyLabel}
      loadingLabel={loadingLabel}
      options={options}
      value={selectedValues}
      multiple
      isLoading={isLoading}
      onValueChange={(values) => {
        if (values.length === 0) {
          onClear();
          return;
        }

        onValueChange(values);
      }}
      hideLabel={hideLabel}
      controlSize={controlSize}
      controlBg={controlBg}
      contentBg={contentBg}
      showColorSwatch={showColorSwatch}
    />
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
  sortPlacement = 'toolbar',
  filtersTitle,
  filtersDescription,
  filtersContent,
  filterStateKey,
  inlineAccessory,
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
  sortPlacement?: 'toolbar' | 'input';
  filtersTitle: string;
  filtersDescription?: string;
  filtersContent: ReactNode;
  filterStateKey?: string;
  inlineAccessory?: ReactNode;
  trailingAccessory?: ReactNode;
  toolbarAccessory?: ReactNode;
  layout?: 'panel' | 'workspace' | 'shell' | 'header';
  title?: string;
}) {
  const isWorkspaceLayout = layout === 'workspace' || layout === 'shell';
  const isShellLayout = layout === 'shell';
  const isHeaderLayout = layout === 'header';
  const hasToolbarAccessory = Boolean(toolbarAccessory);
  const isSortInInput = sortPlacement === 'input';
  const filterTriggerRef = useRef<HTMLButtonElement | null>(null);
  const wasFiltersOpenRef = useRef(false);
  const [filterStateKeyOnOpen, setFilterStateKeyOnOpen] = useState<string | undefined>(undefined);
  const isFilterFormPristine = filterStateKey === undefined || filterStateKey === filterStateKeyOnOpen;

  useEffect(() => {
    if (isFiltersOpen && !wasFiltersOpenRef.current) {
      setFilterStateKeyOnOpen(filterStateKey);
    }
    wasFiltersOpenRef.current = isFiltersOpen;
  }, [filterStateKey, isFiltersOpen]);

  function handleFiltersOpenChange(open: boolean) {
    if (open) {
      onOpenFilters();
      return;
    }

    onCloseFilters();
    window.setTimeout(() => filterTriggerRef.current?.focus(), 0);
  }

  function closeFilters() {
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
      <Stack gap="5">
        {filtersContent}
      </Stack>
    );
  }

  return (
    <>
      <Box
        minW={isHeaderLayout ? '0' : undefined}
        flex={isHeaderLayout ? '1' : undefined}
        rounded={isWorkspaceLayout || isHeaderLayout ? '0' : 'lg'}
        borderWidth={isWorkspaceLayout || isHeaderLayout ? '0' : '1px'}
        borderBottomWidth={layout === 'workspace' ? '1px' : undefined}
        borderColor="border.surface"
        bg={isWorkspaceLayout || isHeaderLayout ? 'bg.workspace' : 'bg.surface'}
        px={isHeaderLayout ? '0' : isWorkspaceLayout ? { base: '4', lg: '6' } : undefined}
        py={isShellLayout ? '2' : isWorkspaceLayout ? '3' : undefined}
        p={isWorkspaceLayout || isHeaderLayout ? undefined : { base: '3', sm: '4' }}
      >
        <Flex direction={isHeaderLayout ? 'row' : { base: 'column', md: 'row' }} align={isHeaderLayout ? 'center' : { md: 'center' }} gap="3">
          {title ? (
            <WorkspacePageTitle minW={{ md: '4.5rem' }}>
              {title}
            </WorkspacePageTitle>
          ) : null}
          <Flex
            minW="0"
            w={isHeaderLayout ? 'full' : { base: 'full', md: 'auto' }}
            flex={isHeaderLayout ? '1' : { md: title ? '1 1 auto' : undefined }}
            direction={isHeaderLayout ? 'row' : { base: 'column', md: 'row' }}
            align={isHeaderLayout ? 'center' : { md: 'center' }}
            justify={isHeaderLayout ? 'flex-start' : { md: title ? 'flex-end' : 'flex-start' }}
            gap="3"
          >
          <Field
            minW="0"
            w="full"
            maxW={isHeaderLayout ? { base: '18rem', md: '24rem', xl: '34rem' } : isShellLayout ? { md: '28rem' } : hasToolbarAccessory ? undefined : { md: 'none', '2xl': '64rem' }}
            flex={isHeaderLayout ? '1' : { md: isShellLayout ? '0 1 28rem' : hasToolbarAccessory ? '2 1 0' : '1 1 auto' }}
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
                h={isHeaderLayout ? '10' : '11'}
                borderColor="border.strong"
                bg="bg.surface"
                pl="11"
                pr={isSortInInput ? '24' : '14'}
                _hover={{ borderColor: 'fg/30' }}
                _focusVisible={{
                  borderColor: 'teal.solid',
                  outline: '2px solid',
                  outlineColor: 'teal.focusRing',
                  outlineOffset: '1px',
                }}
              />
              <HStack position="absolute" right="2" top="50%" transform="translateY(-50%)" gap="1">
                {isSortInInput ? (
                  <DocumentSortMenu
                    ariaLabel={sortAriaLabel}
                    labelId={sortSelectId}
                    value={sortBy}
                    onValueChange={onSortChange}
                    options={sortOptions}
                    variant="input"
                  />
                ) : null}
                {isSortInInput ? (
                  <Separator orientation="vertical" h="6" />
                ) : null}
                <Dialog.Root
                  open={isFiltersOpen}
                  onOpenChange={(event) => handleFiltersOpenChange(event.open)}
                  closeOnEscape
                  closeOnInteractOutside={isFilterFormPristine}
                  size="md"
                >
                  <Dialog.Trigger asChild>
                    {renderFilterButton()}
                  </Dialog.Trigger>
                  <Portal>
                    <Dialog.Backdrop bg="blackAlpha.500" />
                    <Dialog.Positioner>
                      <Dialog.Content
                        maxH="calc(100vh - 3rem)"
                        display="flex"
                        flexDirection="column"
                        overflow="hidden"
                        rounded="lg"
                        borderWidth="1px"
                        borderColor="border.surface"
                        bg="bg.surface"
                        shadow="xl"
                      >
                        <Flex
                          flexShrink={0}
                          align="center"
                          justify="space-between"
                          gap="4"
                          borderBottomWidth="1px"
                          borderColor="border.surface"
                          px="6"
                          py="5"
                        >
                          <Box minW="0">
                            <Dialog.Title fontSize="xl" fontWeight="semibold" color="fg">
                              {filtersTitle}
                            </Dialog.Title>
                            <Dialog.Description srOnly>
                              {filtersDescription ?? 'Adjust filters.'}
                            </Dialog.Description>
                          </Box>

                          <Flex shrink={0} align="center" gap="3">
                            <chakra.button
                              type="button"
                              fontSize="sm"
                              fontWeight="semibold"
                              color="teal.solid"
                              transition="colors"
                              _hover={{ opacity: 0.8 }}
                              _focusVisible={{ outline: '2px solid', outlineColor: 'teal.focusRing', outlineOffset: '2px' }}
                              onClick={onResetFilters}
                            >
                              Reset
                            </chakra.button>
                            <CloseButton size="sm" aria-label="Close filters" onClick={closeFilters} />
                          </Flex>
                        </Flex>

                        <Dialog.Body flex="1" maxH="calc(100vh - 8rem)" overflowY="auto" px="6" py="5">
                          <Box maxW="32rem" w="full">
                            {renderFilterContent()}
                          </Box>
                        </Dialog.Body>
                      </Dialog.Content>
                    </Dialog.Positioner>
                  </Portal>
                </Dialog.Root>
              </HStack>
            </Box>
          </Field>

          {inlineAccessory ? (
            <Flex
              display={isHeaderLayout ? { base: 'none', md: 'flex' } : 'flex'}
              minW="0"
              w={isHeaderLayout ? { md: '11.5rem', xl: '12.5rem' } : undefined}
              maxW={isHeaderLayout ? '18rem' : undefined}
              shrink={0}
              align="center"
            >
              {inlineAccessory}
            </Flex>
          ) : null}

          {!isSortInInput ? (
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
          ) : null}

          {!isHeaderLayout && (toolbarAccessory || trailingAccessory) ? (
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

        {!isHeaderLayout && activeFilters.length > 0 ? (
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
