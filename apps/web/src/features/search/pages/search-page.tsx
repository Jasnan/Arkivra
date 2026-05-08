import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Box, Flex, Grid, Stack, Text } from '@chakra-ui/react';
import { Archive, ArrowRight, Search as SearchIcon, Tags, Vault } from 'lucide-react';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { ROUTES } from '@/app/routes';
import {
  PageIntro,
  SectionTitle,
  StatCard,
  SurfacePanel,
  vaultInputClassName,
} from '@/components/layout/vault-ui';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatDate } from '@/features/documents/documents.utils';
import { useGlobalSearchDocumentsQuery } from '@/features/search/search.queries';
import { stripSnippetMarkup, tokenizeSnippet } from '@/features/search/search.utils';
import { useTagsQuery } from '@/features/tags/tags.queries';
import { useVaultsQuery } from '@/features/vaults/vaults.queries';

const PAGE_SIZE = 10;

export function SearchPage() {
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as Record<string, string>;
  const [query, setQuery] = useState(search.q ?? '');
  const deferredQuery = useDeferredValue(query.trim());

  const vaultId = search.vaultId ?? '';
  const tagId = search.tagId ?? '';
  const dateFrom = search.dateFrom ?? '';
  const dateTo = search.dateTo ?? '';
  const pageIndex = Number.parseInt(search.pageIndex ?? '0', 10) || 0;

  useEffect(() => {
    navigate({
      search: (prev: Record<string, string>) => {
        const next: Record<string, string> = { ...prev }
        if (query.trim().length > 0) {
          next.q = query.trim()
        } else {
          delete next.q
        }
        next.pageIndex = '0'
        return next
      },
      replace: true,
    } as any)
  }, [query, navigate]);

  const vaultsQuery = useVaultsQuery();
  const tagsQuery = useTagsQuery({ vaultId });
  const searchQuery = useGlobalSearchDocumentsQuery({
    query: deferredQuery,
    pageIndex,
    pageSize: PAGE_SIZE,
    vaultId: vaultId || undefined,
    tagId: tagId || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    enabled:
      deferredQuery.length > 0 ||
      vaultId.length > 0 ||
      tagId.length > 0 ||
      dateFrom.length > 0 ||
      dateTo.length > 0,
  });

  const totalPages = useMemo(() => {
    const count = searchQuery.data?.resultsCount ?? 0;
    return Math.max(1, Math.ceil(count / PAGE_SIZE));
  }, [searchQuery.data?.resultsCount]);

  function updateFilters(nextValues: Record<string, string>) {
    navigate({
      search: (prev: Record<string, string>) => {
        const next: Record<string, string> = { ...prev }
        for (const [key, value] of Object.entries(nextValues)) {
          if (value) next[key] = value
          else delete next[key]
        }
        next.pageIndex = '0'
        return next
      },
      replace: true,
    } as any)
  }

  return (
    <Stack as="section" gap="8" pb="8">
      <PageIntro
        eyebrow="Global Discovery"
        title="Search across vaults"
        description="Run full-text discovery across every vault you can access, then narrow results by vault, tag, or document date."
      />

      <Grid gap="4" templateColumns={{ base: '1fr', md: 'repeat(3, 1fr)' }}>
        <StatCard
          label="Accessible vaults"
          value={(vaultsQuery.data?.vaults ?? []).length}
          meta="Search spans only the workspaces your account can reach."
          icon={<Vault size={20} />}
        />
        <StatCard
          label="Current scope"
          value={vaultId ? 'Focused' : 'All vaults'}
          meta={
            vaultId
              ? 'Results are limited to one selected vault.'
              : 'Results can come from any accessible vault.'
          }
          icon={<Archive size={20} />}
        />
        <StatCard
          label="Matches"
          value={deferredQuery.length > 0 ? (searchQuery.data?.resultsCount ?? 0) : 0}
          meta={
            deferredQuery.length > 0
              ? 'Count updates as search terms and filters change.'
              : 'Start typing to query extracted text.'
          }
          icon={<SearchIcon size={20} />}
        />
      </Grid>

      <SurfacePanel display="flex" flexDirection="column" gap="5">
        <SectionTitle eyebrow="Search Controls" title="Query and refine" />

        <Grid gap="4" templateColumns={{ base: '1fr', lg: '2fr 1fr 1fr 1fr' }}>
          <Field>
            <FieldLabel htmlFor="global-search">Search text</FieldLabel>
            <Box position="relative">
              <Box
                position="absolute"
                left="4"
                top="50%"
                transform="translateY(-50%)"
                pointerEvents="none"
                color="fg.muted"
              >
                <SearchIcon size={16} />
              </Box>
              <Input
                id="global-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search invoices, clauses, names..."
                className={vaultInputClassName}
                pl="11"
              />
            </Box>
          </Field>

          <Field>
            <FieldLabel id="search-vault-label">Vault scope</FieldLabel>
            <Select
              value={vaultId || '__all__'}
              onValueChange={(value) => {
                const nextVaultId = value === '__all__' ? '' : value;
                updateFilters({ vaultId: nextVaultId, tagId: nextVaultId ? tagId : '' });
              }}
            >
              <SelectTrigger aria-labelledby="search-vault-label" className={vaultInputClassName}>
                <SelectValue placeholder="All vaults" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All vaults</SelectItem>
                {(vaultsQuery.data?.vaults ?? []).map((vault) => (
                  <SelectItem key={vault.id} value={vault.id}>
                    {vault.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field>
            <FieldLabel id="search-tag-label">Tag filter</FieldLabel>
            <Select
              value={tagId || '__all__'}
              onValueChange={(value) => updateFilters({ tagId: value === '__all__' ? '' : value })}
              disabled={!vaultId}
            >
              <SelectTrigger aria-labelledby="search-tag-label" className={vaultInputClassName}>
                <SelectValue placeholder={vaultId ? 'All tags' : 'Choose a vault first'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">
                  {vaultId ? 'All tags' : 'Choose a vault first'}
                </SelectItem>
                {(tagsQuery.data?.tags ?? []).map((tag) => (
                  <SelectItem key={tag.id} value={tag.id}>
                    {tag.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Grid gap="4" templateColumns={{ base: '1fr 1fr', lg: '1fr' }}>
            <Field>
              <FieldLabel htmlFor="date-from">Date from</FieldLabel>
              <Input
                id="date-from"
                type="date"
                value={dateFrom}
                onChange={(event) => updateFilters({ dateFrom: event.target.value })}
                className={vaultInputClassName}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="date-to">Date to</FieldLabel>
              <Input
                id="date-to"
                type="date"
                value={dateTo}
                onChange={(event) => updateFilters({ dateTo: event.target.value })}
                className={vaultInputClassName}
              />
            </Field>
          </Grid>
        </Grid>
      </SurfacePanel>

      {deferredQuery.length === 0 ? (
        <SurfacePanel variant="soft" display="flex" flexDirection="column" gap="3">
          <Text textStyle="label">Discovery Idle</Text>
          <Text fontSize="sm" lineHeight="6" color="fg.muted">
            Start typing to search extracted text across all accessible vaults.
          </Text>
        </SurfacePanel>
      ) : (
        <SurfacePanel display="flex" flexDirection="column" gap="5">
          <SectionTitle
            eyebrow="Search Results"
            title="Matches"
            action={
              <Box
                display="inline-flex"
                alignItems="center"
                gap="1.5"
                rounded="full"
                bg="bg.subtle"
                px="3"
                py="1"
                fontSize="xs"
                fontWeight="semibold"
                color="fg"
              >
                {searchQuery.data?.resultsCount ?? 0} matches
              </Box>
            }
          />

          {searchQuery.isLoading ? (
            <Text fontSize="sm" color="fg.muted">Searching...</Text>
          ) : null}
          {searchQuery.isError ? (
            <Text fontSize="sm" color="fg.error">Unable to search your vaults.</Text>
          ) : null}

          {!searchQuery.isLoading && (searchQuery.data?.results.length ?? 0) === 0 ? (
            <Box rounded="lg" borderWidth="1px" borderStyle="dashed" borderColor="border" bg="bg.subtle" p="4" color="fg.muted">
              No documents matched your query and filters.
            </Box>
          ) : (
            <Stack gap="4">
              {(searchQuery.data?.results ?? []).map((result) => (
                <Box
                  key={`${result.vaultId}-${result.documentId}`}
                  rounded="lg"
                  bg="bg.subtle"
                  p="5"
                >
                  <Stack gap="4">
                    <Flex
                      direction={{ base: 'column', lg: 'row' }}
                      align={{ lg: 'flex-start' }}
                      justify={{ lg: 'space-between' }}
                      gap="3"
                    >
                      <Stack gap="3">
                        <Box>
                          <Link
                            to={ROUTES.vaultDocument(result.vaultId, result.documentId)}
                            style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--chakra-colors-fg)' }}
                          >
                            {result.name}
                          </Link>
                          <Text mt="2" fontSize="sm" color="fg.muted">
                            {result.vaultName} • {result.mimeType} • {result.matchedChunksCount}{' '}
                            matching chunk{result.matchedChunksCount === 1 ? '' : 's'} • Updated{' '}
                            {formatDate(result.updatedAt)}
                          </Text>
                          <Text fontSize="sm" color="fg.muted">
                            Document date: {formatDate(result.documentDate)}
                          </Text>
                        </Box>

                        <Flex gap="2" flexWrap="wrap">
                          <Flex
                            display="inline-flex"
                            align="center"
                            gap="1.5"
                            rounded="full"
                            bg="bg.subtle"
                            px="3"
                            py="1"
                            fontSize="xs"
                            fontWeight="semibold"
                            color="fg"
                          >
                            <Vault size={14} />
                            <Text as="span">{result.vaultName}</Text>
                          </Flex>
                          {result.bestChunk ? (
                            <Flex
                              display="inline-flex"
                              align="center"
                              gap="1.5"
                              rounded="full"
                              bg="bg.subtle"
                              px="3"
                              py="1"
                              fontSize="xs"
                              fontWeight="semibold"
                              color="fg"
                            >
                              <Tags size={14} />
                              <Text as="span">{result.bestChunk.chunkType ?? 'text chunk'}</Text>
                            </Flex>
                          ) : null}
                        </Flex>
                      </Stack>

                      <Link
                        to={ROUTES.vaultDocument(result.vaultId, result.documentId)}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', color: 'var(--chakra-colors-teal-solid)', fontWeight: 600, fontSize: '0.875rem' }}
                      >
                        Open document
                        <ArrowRight size={16} />
                      </Link>
                    </Flex>

                    {result.bestChunk ? (
                      <>
                        <Box rounded="lg" bg="bg.surface" p="4" fontSize="sm" lineHeight="7" color="fg">
                          <Text textStyle="label" mb="3">
                            Best matching snippet
                            {result.bestChunk.pageNumber !== null
                              ? ` • Page ${result.bestChunk.pageNumber}`
                              : ''}
                          </Text>
                          <Box wordBreak="break-word">
                            {tokenizeSnippet(result.bestChunk.snippet).map((part) =>
                              part.highlighted ? (
                                <Box
                                  as="mark"
                                  key={`${result.documentId}-${part.key}`}
                                  rounded="md"
                                  bg="teal.subtle"
                                  px="1.5"
                                  py="0.5"
                                  color="fg"
                                >
                                  {part.text}
                                </Box>
                              ) : (
                                <Text as="span" key={`${result.documentId}-${part.key}`}>{part.text}</Text>
                              ),
                            )}
                          </Box>
                        </Box>

                        <Box
                          as="details"
                          rounded="lg"
                          bg="bg.subtle"
                          p="4"
                          fontSize="sm"
                          color="fg.muted"
                        >
                          <Box
                            as="summary"
                            cursor="pointer"
                            fontWeight="semibold"
                            color="fg"
                          >
                            Matched chunk preview
                          </Box>
                          <Text mt="3" whiteSpace="pre-wrap" wordBreak="break-word" lineHeight="6">
                            {stripSnippetMarkup(result.bestChunk.content)}
                          </Text>
                        </Box>
                      </>
                    ) : null}
                  </Stack>
                </Box>
              ))}
            </Stack>
          )}

          <Flex
            direction={{ base: 'column', sm: 'row' }}
            align={{ base: 'stretch', sm: 'center' }}
            justify={{ base: 'flex-start', sm: 'space-between' }}
            gap="3"
            pt="2"
          >
            <Text fontSize="xs" textTransform="uppercase" letterSpacing="0.24em" color="fg.muted">
              Page {pageIndex + 1} of {totalPages}
            </Text>
            <Flex gap="2">
              <Button
                type="button"
                variant="outline"
                disabled={pageIndex === 0}
                onClick={() => {
                  navigate({
                    search: (prev: Record<string, string>) => ({ ...prev, pageIndex: String(Math.max(0, pageIndex - 1)) }),
                    replace: true,
                  } as any)
                }}
              >
                Previous
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={pageIndex >= totalPages - 1}
                onClick={() => {
                  navigate({
                    search: (prev: Record<string, string>) => ({ ...prev, pageIndex: String(Math.min(totalPages - 1, pageIndex + 1)) }),
                    replace: true,
                  } as any)
                }}
              >
                Next
              </Button>
            </Flex>
          </Flex>
        </SurfacePanel>
      )}
    </Stack>
  );
}
