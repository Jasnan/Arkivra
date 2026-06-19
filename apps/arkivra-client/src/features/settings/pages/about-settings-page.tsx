import {
  Box,
  Flex,
  HStack,
  Heading,
  Link as ChakraLink,
  SimpleGrid,
  Stack,
  Text,
} from '@chakra-ui/react';
import { BookOpen, ExternalLink, Github, Globe, Scale } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
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
    href: 'https://docs.arkivra.app',
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

export function AboutSettingsPage() {
  return (
    <SettingsPageFrame density="compact">
      <Stack gap="7">
        <Stack gap="5" borderBottomWidth="1px" borderColor="border.muted" pb="6">
          <Stack gap="4">
            <Heading
              as="h1"
              fontSize={{ base: '2xl', md: '3xl' }}
              fontWeight="bold"
              lineHeight="short"
            >
              About Arkivra
            </Heading>
            <Text maxW="3xl" fontSize="md" lineHeight="1.8" color="fg.muted">
              Arkivra is an open-source, self-hosted document management system with semantic search
              and AI-powered chat.
              <br />
              <br />
              Organize documents into vaults, search across your files, and chat with your documents
              using local or connected AI models.
            </Text>
          </Stack>

          <Badge
            variant="secondary"
            alignSelf="flex-start"
            display="inline-flex"
            alignItems="center"
            gap="2"
            rounded="full"
            bg="bg.muted"
            color="fg.muted"
            px="3"
            py="1"
            fontSize="sm"
            fontWeight="medium"
          >
            <Box boxSize="1.5" rounded="full" bg="currentColor" />
            <Text as="span">Version</Text>
            <Text as="span">{packageJson.version}</Text>
          </Badge>
        </Stack>

        <Stack gap="4" borderBottomWidth="1px" borderColor="border.muted" pb="6">
          <Heading as="h2" fontSize="lg" fontWeight="semibold">
            Links
          </Heading>
          <SimpleGrid columns={{ base: 1, lg: 2 }} gap="4">
            {appLinks.map((link) => {
              const Icon = link.icon;

              return (
                <ChakraLink
                  key={link.label}
                  href={link.href}
                  target="_blank"
                  rel="noreferrer"
                  rounded="md"
                  borderWidth="1px"
                  borderColor="border.surface"
                  bg="bg.surface"
                  color="fg"
                  px="4"
                  py="4"
                  textDecoration="none"
                  _hover={{ borderColor: 'teal.solid', bg: 'bg.subtle', color: 'fg' }}
                >
                  <HStack justify="space-between" gap="4">
                    <HStack gap="3" minW="0">
                      <Flex
                        boxSize="10"
                        align="center"
                        justify="center"
                        rounded="md"
                        bg="teal.subtle"
                        color="teal.fg"
                        flexShrink={0}
                      >
                        <Icon size={20} strokeWidth={1.8} />
                      </Flex>
                      <Stack gap="1" minW="0">
                        <Text fontSize="md" fontWeight="semibold" color="fg">
                          {link.label}
                        </Text>
                        <Text textStyle="sm" color="fg.muted" truncate>
                          {link.description}
                        </Text>
                      </Stack>
                    </HStack>
                    <Box color="fg.muted" flexShrink={0}>
                      <ExternalLink size={17} />
                    </Box>
                  </HStack>
                </ChakraLink>
              );
            })}
          </SimpleGrid>
        </Stack>

        <HStack
          aria-label="Arkivra is crafted with ❤️ by Jasnan Thachaparamban"
          gap="1.5"
          flexWrap="wrap"
          textStyle="sm"
          color="fg.muted"
        >
          <Text>Arkivra is crafted with ❤️ by</Text>
          <ChakraLink
            href={authorUrl}
            target="_blank"
            rel="noreferrer"
            color="teal.fg"
            fontWeight="semibold"
          >
            Jasnan Thachaparamban
          </ChakraLink>
        </HStack>
      </Stack>
    </SettingsPageFrame>
  );
}
