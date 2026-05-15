import { Box, Flex, HStack, Heading, Link as ChakraLink, SimpleGrid, Stack, Text } from '@chakra-ui/react';
import type { ReactNode } from 'react';
import { BookOpen, CalendarDays, ExternalLink, Github, GitCommitHorizontal, Globe, Heart, Scale, Tag } from 'lucide-react';
import packageJson from '../../../../package.json';
import { SettingsPageFrame } from '../components/settings-ui';

const repositoryUrl = 'https://github.com/Jasnan/Arkivra';
const licenseUrl = 'https://github.com/Jasnan/arkivra/blob/main/LICENSE';
const authorUrl = 'https://jasnan.xyz';

const appLinks = [
  {
    description: 'Product site and project overview',
    href: 'https://arkivra.app',
    icon: Globe,
    label: 'Website',
  },
  {
    description: 'User guides and API reference',
    href: 'https://docs.arkivra.io',
    icon: BookOpen,
    label: 'Documentation',
  },
  {
    description: 'Source code and issue tracker',
    href: repositoryUrl,
    icon: Github,
    label: 'GitHub',
  },
  {
    description: 'Open-source license terms',
    href: licenseUrl,
    icon: Scale,
    label: 'License',
  },
];

function envValue(key: string, fallback: string) {
  const value = import.meta.env[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : fallback;
}

export function AboutSettingsPage() {
  const build = envValue('VITE_ARKIVRA_BUILD', 'Local development');
  const commitDate = envValue('VITE_ARKIVRA_COMMIT_DATE', 'unknown');

  return (
    <SettingsPageFrame>
      <Box maxW="4xl" rounded="lg" borderWidth="1px" borderColor="border.subtle" bg="bg.surface" p={{ base: '5', md: '7' }} shadow="xs">
        <Stack gap="7">
          <Stack gap="3">
            <Heading as="h2" fontSize={{ base: '2xl', md: '3xl' }} fontWeight="bold" lineHeight="short">
              About Arkivra
            </Heading>
            <Text maxW="3xl" fontSize="md" lineHeight="1.7" color="fg.muted">
              Arkivra is an open-source document management system for organizing, searching,
              and managing private knowledge across self-hosted vaults.
            </Text>
          </Stack>

          <SimpleGrid columns={{ base: 1, md: 3 }} gap="3">
            <MetaItem icon={<Tag size={17} />} label="Version" value={packageJson.version} />
            <MetaItem icon={<GitCommitHorizontal size={17} />} label="Build" value={build} />
            <MetaItem icon={<CalendarDays size={17} />} label="Commit Date" value={commitDate} />
          </SimpleGrid>

          <Stack gap="3">
            <Heading as="h3" fontSize="lg" fontWeight="semibold">
              Links
            </Heading>
            <SimpleGrid columns={{ base: 1, lg: 2 }} gap="3">
              {appLinks.map((link) => {
                const Icon = link.icon;

                return (
                  <ChakraLink
                    key={link.label}
                    href={link.href}
                    target="_blank"
                    rel="noreferrer"
                    rounded="lg"
                    borderWidth="1px"
                    borderColor="border.subtle"
                    bg="bg.subtle"
                    color="fg"
                    px="4"
                    py="3.5"
                    textDecoration="none"
                    _hover={{ borderColor: 'teal.solid', bg: 'bg.muted', color: 'fg' }}
                  >
                    <HStack justify="space-between" gap="4">
                      <HStack gap="3" minW="0">
                        <Flex boxSize="11" align="center" justify="center" rounded="md" bg="teal.subtle" color="teal.fg" flexShrink={0}>
                          <Icon size={20} />
                        </Flex>
                        <Stack gap="0.5" minW="0">
                          <Text fontSize="sm" fontWeight="semibold" color="fg">
                            {link.label}
                          </Text>
                          <Text textStyle="sm" color="fg.muted" truncate>
                            {link.description}
                          </Text>
                        </Stack>
                      </HStack>
                      <ExternalLink size={16} />
                    </HStack>
                  </ChakraLink>
                );
              })}
            </SimpleGrid>
          </Stack>

          <HStack
            aria-label="Arkivra is developed with love by Jasnan Thachaparamban (https://jasnan.xyz)."
            gap="1.5"
            flexWrap="wrap"
            borderTopWidth="1px"
            borderColor="border.subtle"
            pt="5"
            textStyle="sm"
            color="fg.muted"
          >
            <Text>Arkivra is developed with</Text>
            <Heart size={15} fill="currentColor" color="var(--chakra-colors-teal-fg)" />
            <Text>love by</Text>
            <ChakraLink href={authorUrl} target="_blank" rel="noreferrer" color="teal.fg" fontWeight="medium">
              Jasnan Thachaparamban
            </ChakraLink>
            <Text>({authorUrl}).</Text>
          </HStack>
        </Stack>
      </Box>
    </SettingsPageFrame>
  );
}

function MetaItem({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <HStack gap="2.5" rounded="md" borderWidth="1px" borderColor="border.subtle" bg="bg.subtle" px="3.5" py="3">
      <Box color="fg.muted" flexShrink={0}>
        {icon}
      </Box>
      <HStack gap="1.5" minW="0">
        <Text fontSize="sm" fontWeight="medium" color="fg.muted">
          {label}:
        </Text>
        <Text fontSize="sm" fontWeight="semibold" color="fg" truncate>
          {value}
        </Text>
      </HStack>
    </HStack>
  );
}
