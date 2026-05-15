import type React from 'react';
import type { ComponentType, FormEventHandler, PropsWithChildren, ReactNode } from 'react';
import { useState } from 'react';
import {
  Box,
  Flex,
  Grid,
  Heading,
  Icon,
  IconButton,
  Separator,
  Stack,
  Text,
  chakra,
} from '@chakra-ui/react';
import { Link } from '@tanstack/react-router';
import { ArrowRight, Eye, EyeOff, Github, Loader2 } from 'lucide-react';
import type { LucideProps } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';

type AuthIcon = ComponentType<LucideProps>;

export function AuthLayout({ children }: PropsWithChildren) {
  return (
    <Box
      minH="100vh"
      overflowX="hidden"
      color="fg"
      bg="auth.canvas"
      background="linear-gradient(180deg, var(--chakra-colors-auth-canvas) 0%, var(--chakra-colors-auth-canvas-end) 100%)"
      position="relative"
    >
      <Flex
        position="relative"
        zIndex="1"
        direction="column"
        align="center"
        justify="center"
        minH="100svh"
        px={{ base: '5', sm: '6', lg: '8' }}
        py={{ base: '7', md: '8' }}
      >
        <Stack
          as="main"
          w="100%"
          maxW="62rem"
          align="center"
          gap={{ base: '4', md: '5' }}
        >
          <AuthHero />
          <Box position="relative" w="100%" maxW={{ base: '100%', sm: '30rem', md: '32rem' }}>
            {children}
          </Box>
        </Stack>
      </Flex>
    </Box>
  );
}

export function AuthHero() {
  return (
    <Stack id="8nh2j6" align="center" gap="1.5" textAlign="center">
      <Heading
        as="h1"
        textStyle="display"
        fontSize={{ base: '2xl', md: '3xl' }}
        fontWeight="760"
        color="fg"
        letterSpacing="display"
        lineHeight="1"
      >
        Arkivra
      </Heading>
      <Stack gap="1" align="center">
        <Text
          color="fg.muted"
          fontSize="sm"
          lineHeight="1.5"
          maxW="28rem"
          opacity="0.68"
        >
          Private document archive
        </Text>
      </Stack>
    </Stack>
  );
}

export function AuthCard({
  title,
  subtitle,
  children,
}: PropsWithChildren<{ title: string; subtitle?: string }>) {
  return (
    <Box
      position="relative"
      zIndex="1"
      w="100%"
      rounded="authCard"
      borderWidth="1px"
      borderColor="auth.cardBorder"
      bg="auth.card"
      shadow="authCard"
      px="4"
      py="4"
    >
      <Stack position="relative" gap="3.5">
        <AuthHeader title={title} subtitle={subtitle} />
        {children}
      </Stack>
    </Box>
  );
}

export function AuthHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <Stack gap="1.5">
      <Heading
        as="h2"
        textStyle="2xl"
        fontSize={{ base: 'xl', md: 'xl' }}
        fontWeight="750"
        color="fg"
        letterSpacing="heading"
        lineHeight="1.2"
      >
        {title}
      </Heading>
      {subtitle ? (
        <Text color="fg.muted" fontSize="md" lineHeight="1.45">
          {subtitle}
        </Text>
      ) : null}
    </Stack>
  );
}

type AuthFieldProps = React.ComponentProps<typeof Input> & {
  label: string;
  icon?: AuthIcon;
  error?: string | null;
  rightElement?: ReactNode;
};

export function AuthField({
  id,
  label,
  icon: FieldIcon,
  error,
  rightElement,
  pe,
  ...props
}: AuthFieldProps) {
  return (
    <Field display="grid" gap="1.5">
      <FieldLabel htmlFor={id} fontSize="sm" fontWeight="750">
        {label}
      </FieldLabel>
      <Box position="relative">
        <Input
          id={id}
          h="10"
          minH="10"
          rounded="authControl"
          borderColor={error ? 'fg.error' : 'auth.fieldBorder'}
          bg="auth.field"
          px={{ base: '5', md: '6' }}
          pe={pe ?? (rightElement || FieldIcon ? '4rem' : { base: '5', md: '6' })}
          color="fg"
          fontSize="sm"
          _placeholder={{ color: 'fg.subtle' }}
          _hover={{ bg: 'auth.fieldHover', borderColor: error ? 'fg.error' : 'auth.cardBorder' }}
          _focusVisible={{
            borderColor: 'teal.solid',
            boxShadow: '0 0 0 3px var(--chakra-colors-teal-focus-ring)',
            outline: 'none',
          }}
          {...props}
        />
        {rightElement ? (
          <Flex
            position="absolute"
            top="50%"
            right="3"
            transform="translateY(-50%)"
            align="center"
            justify="center"
          >
            {rightElement}
          </Flex>
        ) : FieldIcon ? (
          <Flex
            position="absolute"
            top="50%"
            right="4"
            transform="translateY(-50%)"
            align="center"
            justify="center"
            boxSize="7"
            color="teal.fg"
            opacity="0.82"
            pointerEvents="none"
          >
            <FieldIcon size={18} strokeWidth={2} />
          </Flex>
        ) : null}
      </Box>
      {error ? <FieldError>{error}</FieldError> : null}
    </Field>
  );
}

type AuthPasswordFieldProps = Omit<AuthFieldProps, 'type' | 'icon' | 'rightElement'>;

export function AuthPasswordField(props: AuthPasswordFieldProps) {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <AuthField
      type={isVisible ? 'text' : 'password'}
      pe="3.75rem"
      rightElement={(
        <IconButton
          aria-label={isVisible ? 'Hide password' : 'Show password'}
          variant="ghost"
          size="sm"
          color="fg.subtle"
          rounded="full"
          onClick={() => setIsVisible((value) => !value)}
        >
          {isVisible ? <EyeOff size={20} /> : <Eye size={20} />}
        </IconButton>
      )}
      {...props}
    />
  );
}

export function AuthForm({
  children,
  onSubmit,
}: PropsWithChildren<{ onSubmit: FormEventHandler<HTMLFormElement> }>) {
  return (
    <chakra.form display="grid" gap="3" onSubmit={onSubmit}>
      {children}
    </chakra.form>
  );
}

export function AuthPrimaryButton({
  children,
  loading,
  loadingText,
  ...props
}: React.ComponentProps<typeof Button> & { loading?: boolean; loadingText?: string }) {
  return (
    <Button
      type="submit"
      w="100%"
      h="10"
      minH="10"
      rounded="authControl"
      bgGradient="to-r"
      gradientFrom="auth.primaryFrom"
      gradientTo="auth.primaryTo"
      color="white"
      fontSize="md"
      fontWeight="750"
      shadow="none"
      loading={loading}
      loadingText={loadingText}
      _hover={{ filter: 'brightness(1.03)' }}
      _active={{ filter: 'brightness(0.98)' }}
      _focusVisible={{
        boxShadow: '0 0 0 3px var(--chakra-colors-teal-focus-ring)',
      }}
      transition="filter 160ms ease, box-shadow 160ms ease"
      {...props}
    >
      {children}
    </Button>
  );
}

export function OAuthButtons({
  onGoogle,
  onGithub,
  disabled,
  loadingProvider,
}: {
  onGoogle: () => void;
  onGithub: () => void;
  disabled?: boolean;
  loadingProvider?: 'google' | 'github' | null;
}) {
  return (
    <Stack gap="3">
      <Flex align="center" gap="3" color="fg.muted" fontSize="sm" fontWeight="600">
        <Separator flex="1" borderColor="auth.cardBorder" />
        <Text>or</Text>
        <Separator flex="1" borderColor="auth.cardBorder" />
      </Flex>

      <Grid templateColumns={{ base: '1fr', sm: '1fr 1fr' }} gap="3">
        <AuthOAuthButton
          label="Google"
          icon={<GoogleMark />}
          loading={loadingProvider === 'google'}
          disabled={disabled}
          onClick={onGoogle}
        />
        <AuthOAuthButton
          label="GitHub"
          icon={<Github size={18} fill="currentColor" />}
          loading={loadingProvider === 'github'}
          disabled={disabled}
          onClick={onGithub}
        />
      </Grid>
    </Stack>
  );
}

function AuthOAuthButton({
  label,
  icon,
  loading,
  disabled,
  onClick,
}: {
  label: string;
  icon: ReactNode;
  loading?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      h="9"
      minH="9"
      rounded="authControl"
      borderColor="auth.fieldBorder"
      bg="auth.field"
      color="fg"
      fontSize="sm"
      fontWeight="700"
      disabled={disabled || loading}
      onClick={onClick}
      _hover={{ bg: 'auth.fieldHover', borderColor: 'auth.cardBorder' }}
      transition="background 160ms ease, border-color 160ms ease"
    >
      {loading ? <Loader2 size={20} className="arkivra-auth-spin" /> : icon}
      {label}
    </Button>
  );
}

function GoogleMark() {
  return (
    <chakra.svg viewBox="0 0 24 24" boxSize="5" aria-hidden="true" focusable="false">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09Z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23Z" />
      <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84Z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06L5.84 9.9C6.71 7.3 9.14 5.38 12 5.38Z" />
    </chakra.svg>
  );
}

export function AuthFooter({ children }: { children: ReactNode }) {
  return (
    <Flex
      flexWrap="wrap"
      align="center"
      justify="space-between"
      gap="5"
      fontSize="sm"
      fontWeight="700"
      color="fg.muted"
    >
      {children}
    </Flex>
  );
}

export function AuthLink({
  to,
  children,
  withArrow,
}: {
  to: string;
  children: ReactNode;
  withArrow?: boolean;
}) {
  return (
    <Link
      to={to}
      style={{
        alignItems: 'center',
        color: 'var(--chakra-colors-auth-link)',
        display: 'inline-flex',
        gap: '0.45rem',
        textDecoration: 'none',
      }}
    >
      {children}
      {withArrow ? <ArrowRight size={18} /> : null}
    </Link>
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
      borderColor="auth.cardBorder"
      pt="5"
      fontSize="md"
      color="fg.muted"
    >
      {children}
    </Flex>
  );
}

export function AuthStatus({
  tone = 'info',
  icon,
  title,
  children,
}: PropsWithChildren<{
  tone?: 'info' | 'success' | 'error';
  icon?: AuthIcon;
  title?: string;
}>) {
  const StatusIcon = icon;

  return (
    <Flex
      gap="3"
      align="flex-start"
      rounded="authControl"
      borderWidth="1px"
      borderColor={tone === 'error' ? 'fg.error' : 'auth.cardBorder'}
      bg={tone === 'success' ? 'bg.success' : tone === 'error' ? 'bg.error' : 'auth.field'}
      px="4"
      py="3.5"
      color={tone === 'error' ? 'fg.error' : 'fg'}
    >
      {StatusIcon ? (
        <Icon as={StatusIcon} boxSize="5" mt="0.5" color={tone === 'success' ? 'fg.success' : 'teal.fg'} />
      ) : null}
      <Stack gap="1">
        {title ? <Text fontWeight="750">{title}</Text> : null}
        <Text color={tone === 'error' ? 'fg.error' : 'fg.muted'} lineHeight="1.55">
          {children}
        </Text>
      </Stack>
    </Flex>
  );
}

export function AuthLoadingState() {
  return (
    <AuthLayout>
      <AuthCard title="Opening your vaults" subtitle="Checking your secure session.">
        <Flex align="center" gap="3" color="fg.muted" fontWeight="650">
          <Loader2 size={22} className="arkivra-auth-spin" />
          Checking session...
        </Flex>
      </AuthCard>
    </AuthLayout>
  );
}
