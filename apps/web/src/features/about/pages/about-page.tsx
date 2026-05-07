import { Box, Flex, Grid, Heading, Stack, Text, chakra } from '@chakra-ui/react';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, LockKeyhole, SearchCheck } from 'lucide-react';
import { PageIntro, StatCard, SurfacePanel } from '@/components/layout/vault-ui';
import { getHealth } from '@/lib/api';

export function AboutPage() {
  const healthQuery = useQuery({
    queryKey: ['health'],
    queryFn: getHealth,
  });

  return (
    <Stack as="section" gap="8" pb="8">
      <PageIntro
        eyebrow="Platform Overview"
        title="About Arkivra"
        description="Arkivra is a self-hosted, AI-ready document management system built for private control, structured search, and a durable vault model."
      />

      <Grid gap="4" templateColumns={{ base: '1fr', md: 'repeat(3, minmax(0, 1fr))' }}>
        <StatCard
          label="Hosting model"
          value="Self-hosted"
          meta="Documents stay on infrastructure you control."
          icon={<LockKeyhole className="size-5" />}
        />
        <StatCard
          label="Search posture"
          value="Keyword live"
          meta="Semantic and chat workflows can layer in later phases."
          icon={<SearchCheck className="size-5" />}
        />
        <StatCard
          label="License"
          value="AGPL-3.0"
          meta="Open source by default."
          icon={<BookOpen className="size-5" />}
        />
      </Grid>

      <Grid gap="6" templateColumns={{ base: '1fr', lg: '0.9fr 1.1fr' }}>
        <SurfacePanel display="flex" flexDirection="column" gap="5">
          <Stack gap="2">
            <Text textStyle="label">Instance</Text>
            <Heading as="h2" textStyle="section.title">Runtime status</Heading>
          </Stack>

          {healthQuery.isLoading ? (
            <Text textStyle="metadata">Loading version info...</Text>
          ) : null}
          {healthQuery.isError ? (
            <Text textStyle="metadata" color="status.danger">Unable to load instance metadata.</Text>
          ) : null}
          {healthQuery.data ? (
            <Stack as="dl" gap="4" fontSize="sm">
              <Box>
                <Text as="dt" color="text.muted">Status</Text>
                <Text as="dd" fontWeight="medium" color="text.default">{healthQuery.data.status}</Text>
              </Box>
              <Box>
                <Text as="dt" color="text.muted">Version</Text>
                <Text as="dd" fontWeight="medium" color="text.default">{healthQuery.data.version}</Text>
              </Box>
              <Box>
                <Text as="dt" color="text.muted">Reported at</Text>
                <Text as="dd" fontWeight="medium" color="text.default">
                  {new Date(healthQuery.data.timestamp).toLocaleString()}
                </Text>
              </Box>
            </Stack>
          ) : null}
        </SurfacePanel>

        <SurfacePanel variant="soft" display="flex" flexDirection="column" gap="5">
          <Stack gap="2">
            <Text textStyle="label">Project</Text>
            <Heading as="h2" textStyle="section.title">Core direction</Heading>
          </Stack>

          <Stack gap="3" textStyle="body" color="text.muted">
            <Text>Self-hosted first, so the installation runs on infrastructure you control.</Text>
            <Text>Vault-based organization with explicit ownership, membership, and permissions.</Text>
            <Text>Keyword search is live today, with semantic workflows planned for future phases.</Text>
          </Stack>

          <Flex flexWrap="wrap" gap="3">
            <chakra.a
              href="https://github.com/Jasnan/Arkivra"
              target="_blank"
              rel="noreferrer"
              className="vault-link"
            >
              GitHub repository
            </chakra.a>
            <chakra.a
              href="https://github.com/Jasnan/Arkivra/blob/main/README.md"
              target="_blank"
              rel="noreferrer"
              className="vault-link"
            >
              README
            </chakra.a>
          </Flex>
        </SurfacePanel>
      </Grid>
    </Stack>
  );
}
