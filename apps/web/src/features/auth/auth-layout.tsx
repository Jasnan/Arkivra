import type { PropsWithChildren, ReactNode } from 'react';
import { Box, Flex, Stack } from '@chakra-ui/react';
import { Link } from 'react-router-dom';
import { ROUTES } from '@/app/routes';
import { ThemeToggle } from '@/components/navigation/theme-toggle';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export function AuthLayout({ children }: PropsWithChildren) {
  return (
    <Box minH="100vh" bg="bg.muted" color="fg">
      <Flex
        direction="column"
        mx="auto"
        minH="100vh"
        w="100%"
        maxW="28rem"
        px="4"
        py="6"
        sm={{ px: '6' }}
      >
        <Flex as="header" align="center" justify="space-between" mb="10">
          <Link to={ROUTES.root} style={{ fontSize: '0.875rem', fontWeight: 600, letterSpacing: '-0.025em' }}>
            Arkivra
          </Link>
          <ThemeToggle />
        </Flex>

        <Flex as="main" flex="1" align="center" justify="center">
          {children}
        </Flex>
      </Flex>
    </Box>
  );
}

export function AuthCard({
  title,
  subtitle,
  children,
}: PropsWithChildren<{ title: string; subtitle?: string }>) {
  return (
    <Card w="100%" p={{ base: '5', sm: '6' }}>
      <CardHeader pb="4" px="0">
        <CardTitle>{title}</CardTitle>
        {subtitle ? <CardDescription mt="1">{subtitle}</CardDescription> : null}
      </CardHeader>
      <CardContent px="0" pb="0">
        <Stack gap="4">{children}</Stack>
      </CardContent>
    </Card>
  );
}

export function AuthActions({ children }: { children: ReactNode }) {
  return (
    <Flex
      flexWrap="wrap"
      align="center"
      justify="center"
      gap="3"
      borderTopWidth="1px"
      borderColor="border.subtle"
      pt="4"
      fontSize="sm"
    >
      {children}
    </Flex>
  );
}
