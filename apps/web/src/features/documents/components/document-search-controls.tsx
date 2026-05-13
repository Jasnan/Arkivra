import type { ReactNode } from 'react';
import { Box, Flex, Text, chakra } from '@chakra-ui/react';
import { Search as SearchIcon, SlidersHorizontal, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export interface DocumentSearchControlOption<TValue extends string> {
  value: TValue;
  label: string;
}

export interface DocumentSearchControlFilter {
  key: string;
  label: string;
  onRemove: () => void;
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
      borderColor="border.subtle"
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
  layout = 'panel',
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
  layout?: 'panel' | 'workspace';
}) {
  const isWorkspaceLayout = layout === 'workspace';

  return (
    <Dialog
      open={isFiltersOpen}
      onOpenChange={(open) => {
        if (open) {
          onOpenFilters();
          return;
        }

        onCloseFilters();
      }}
    >
      <Box
        rounded={isWorkspaceLayout ? '0' : 'lg'}
        borderWidth={isWorkspaceLayout ? '0' : '1px'}
        borderBottomWidth={isWorkspaceLayout ? '1px' : undefined}
        borderColor="border.subtle"
        bg={isWorkspaceLayout ? 'bg.workspace' : 'bg.surface'}
        px={isWorkspaceLayout ? { base: '4', lg: '6' } : undefined}
        py={isWorkspaceLayout ? '3' : undefined}
        p={isWorkspaceLayout ? undefined : { base: '3', sm: '4' }}
      >
        <Flex direction={{ base: 'column', xl: 'row' }} gap="3">
          <Field minW="0" flex="1">
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
                borderColor="border.subtle"
                bg="bg.surface"
                pl="11"
                pr="4"
              />
            </Box>
          </Field>

          <Flex direction={{ base: 'column', sm: 'row' }} gap="3">
            <DialogTrigger asChild>
              <Button
                type="button"
                variant="outline"
                h="11"
                minW="36"
                borderColor="border.subtle"
                px="4"
                shadow="none"
              >
                <SlidersHorizontal size={20} />
                <Text as="span">Filter</Text>
                {activeFilterCount > 0 ? (
                  <Text
                    as="span"
                    display="inline-flex"
                    minW="7"
                    justifyContent="center"
                    rounded="full"
                    bg="bg.subtle"
                    px="2"
                    py="1"
                    fontSize="xs"
                    fontWeight="bold"
                    color="fg"
                  >
                    {activeFilterCount}
                  </Text>
                ) : null}
              </Button>
            </DialogTrigger>

            <Flex
              align="center"
              gap="3"
              rounded="lg"
              borderWidth="1px"
              borderColor="border.subtle"
              bg="bg.surface"
              px="3"
              py="1.5"
              shadow="none"
            >
              <Text as="span" id={sortSelectId} fontSize="sm" fontWeight="semibold" color="fg.muted">
                Sort
              </Text>
              <Select value={sortBy} onValueChange={(value) => onSortChange(value as TSortValue)}>
                <SelectTrigger
                  aria-label={sortAriaLabel}
                  aria-labelledby={sortSelectId}
                  h="9"
                  minW="40"
                  border="0"
                  bg="transparent"
                  px="0"
                  shadow="none"
                  focusRing="none"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="end">
                  {sortOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Flex>
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

      <DialogContent
        hideCloseButton
        maxH="calc(100vh-3rem)"
        maxW="2xl"
        overflowY="auto"
        p={{ base: '5', sm: '7' }}
      >
        <Flex align="center" justify="space-between" gap="4">
          <Flex align="center" gap="3">
            <Flex boxSize="10" align="center" justify="center" rounded="lg" bg="bg.subtle" color="teal.solid">
              <SlidersHorizontal size={20} />
            </Flex>
            <DialogHeader>
              <DialogTitle>{filtersTitle}</DialogTitle>
              <DialogDescription srOnly={!filtersDescription}>
                {filtersDescription ?? 'Adjust filters.'}
              </DialogDescription>
            </DialogHeader>
          </Flex>

          <Flex align="center" gap="3">
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
            <chakra.button
              type="button"
              display="flex"
              alignItems="center"
              justifyContent="center"
              w="9"
              h="9"
              rounded="lg"
              color="fg.muted"
              transition="colors"
              _hover={{ bg: 'bg.subtle', color: 'fg' }}
              aria-label="Close filters"
              onClick={onCloseFilters}
            >
              <X size={20} />
            </chakra.button>
          </Flex>
        </Flex>

        <Box mt="6" display="flex" flexDirection="column" gap="5">
          {filtersContent}
        </Box>

        <Separator mt="7" />
        <Flex flexWrap="wrap" justify="flex-end" gap="4" pt="5">
          <Button type="button" px="5" onClick={onCloseFilters}>
            Done
          </Button>
        </Flex>
      </DialogContent>
    </Dialog>
  );
}
