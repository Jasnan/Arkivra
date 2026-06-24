import type React from 'react';
import type { ComponentType, FormEventHandler, PropsWithChildren, ReactNode } from 'react';
import {
  Box,
  Flex,
  Grid,
  Heading,
  Icon,
  Separator,
  Stack,
  Text,
  chakra,
} from '@chakra-ui/react';
import { Link } from '@tanstack/react-router';
import { ArrowRight, Eye, EyeOff, Loader2 } from 'lucide-react';
import type { LucideProps } from 'lucide-react';
import githubBrandSvg from '@/assets/brand-github.svg?raw';
import googleBrandSvg from '@/assets/brand-google.svg?raw';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';

type AuthIcon = ComponentType<LucideProps>;

const authPanelMaxW = { base: '100%', sm: 'calc(28.5rem - 20px)', md: 'calc(29rem - 20px)' } as const;
const authHeroMaxW = { base: '100%', sm: 'calc(28.5rem - 20px)', md: '42rem' } as const;
const authCardPaddingX = { base: '5', md: '7' } as const;

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
          <Box position="relative" w="100%" maxW={authPanelMaxW}>
            {children}
          </Box>
        </Stack>
      </Flex>
    </Box>
  );
}

export function AuthHero() {
  return (
    <Stack id="8nh2j6" w="100%" maxW={authHeroMaxW} align="stretch" gap="1.5">
      <Heading
        as="h1"
        textStyle="display"
        fontSize={{ base: '3xl', md: '4xl' }}
        fontWeight="semibold"
        color="fg.heading"
        letterSpacing="display"
        lineHeight="1"
        textAlign="center"
      >
        Arkivra
      </Heading>
      <Stack gap="1" align="stretch">
        <Text
          color="fg.muted"
          fontSize="sm"
          lineHeight="1.5"
          w="100%"
          px={{ base: authCardPaddingX.base, md: '0' }}
          opacity="0.86"
          textAlign="center"
          whiteSpace={{ md: 'nowrap' }}
        >
          <Box as="span" whiteSpace="nowrap">
            Private Document Management
          </Box>
          {' '}
          <Box as="span" whiteSpace="nowrap">
            with Intelligent Retrieval
          </Box>
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
      px={authCardPaddingX}
      py={{ base: '5', md: '7' }}
    >
      <Stack position="relative" gap={{ base: '4', md: '4.5' }}>
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
  className,
  ...props
}: AuthFieldProps) {
  return (
    <Field display="grid" gap="2">
      <FieldLabel htmlFor={id} fontSize="sm" fontWeight="750">
        {label}
      </FieldLabel>
      <Box position="relative">
        <Input
          id={id}
          className={['arkivra-auth-input', className].filter(Boolean).join(' ')}
          size="lg"
          rounded="authControl"
          borderColor={error ? 'fg.error' : 'auth.fieldBorder'}
          bg="auth.field"
          pe={pe ?? (rightElement || FieldIcon ? '4rem' : { base: '5', md: '6' })}
          color="fg"
          fontSize="sm"
          _placeholder={{ color: 'fg.subtle' }}
          _hover={{ bg: 'auth.fieldHover', borderColor: error ? 'fg.error' : 'border.strong' }}
          _focusVisible={{
            borderColor: 'teal.hover',
            boxShadow: '0 0 0 1px var(--chakra-colors-teal-solid), 0 0 0 4px var(--chakra-colors-teal-focus-ring)',
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

export function AuthPasswordField({
  id,
  label,
  error,
  pe,
  className,
  ...props
}: AuthPasswordFieldProps) {
  return (
    <Field display="grid" gap="2">
      <FieldLabel htmlFor={id} fontSize="sm" fontWeight="750">
        {label}
      </FieldLabel>
      <PasswordInput
        id={id}
        className={['arkivra-auth-input', className].filter(Boolean).join(' ')}
        size="lg"
        rounded="authControl"
        borderColor={error ? 'fg.error' : 'auth.fieldBorder'}
        bg="auth.field"
        pe={pe ?? '3.75rem'}
        color="fg"
        fontSize="sm"
        visibilityIcon={{ on: <Eye size={20} />, off: <EyeOff size={20} /> }}
        _placeholder={{ color: 'fg.subtle' }}
        _hover={{ bg: 'auth.fieldHover', borderColor: error ? 'fg.error' : 'border.strong' }}
        _focusVisible={{
          borderColor: 'teal.hover',
          boxShadow: '0 0 0 1px var(--chakra-colors-teal-solid), 0 0 0 4px var(--chakra-colors-teal-focus-ring)',
          outline: 'none',
        }}
        {...props}
      />
      {error ? <FieldError>{error}</FieldError> : null}
    </Field>
  );
}

export function AuthForm({
  children,
  onSubmit,
}: PropsWithChildren<{ onSubmit: FormEventHandler<HTMLFormElement> }>) {
  return (
    <chakra.form display="grid" gap="3.5" onSubmit={onSubmit}>
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
      size="lg"
      rounded="authControl"
      bgGradient="to-r"
      gradientFrom="auth.primaryFrom"
      gradientTo="auth.primaryTo"
      color="white"
      fontSize="md"
      fontWeight="750"
      shadow="authButton"
      loading={loading}
      loadingText={loadingText}
      _hover={{ filter: 'brightness(1.06)', transform: 'translateY(-1px)' }}
      _active={{ filter: 'brightness(0.96)', transform: 'translateY(0)' }}
      _disabled={{ cursor: 'not-allowed', filter: 'none', opacity: '0.68', transform: 'none' }}
      _focusVisible={{
        boxShadow: '0 0 0 3px var(--chakra-colors-teal-focus-ring)',
      }}
      transition="filter 160ms ease, box-shadow 160ms ease, transform 160ms ease"
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
          icon={<AuthBrandIcon svg={googleBrandSvg} />}
          loading={loadingProvider === 'google'}
          disabled={disabled}
          onClick={onGoogle}
        />
        <AuthOAuthButton
          label="GitHub"
          icon={<AuthBrandIcon svg={githubBrandSvg} />}
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
      size="md"
      rounded="authControl"
      borderColor="auth.cardBorder"
      bg="transparent"
      color="fg.muted"
      fontSize="sm"
      fontWeight="700"
      gap="2.5"
      px="4"
      disabled={disabled || loading}
      onClick={onClick}
      _hover={{ bg: 'auth.fieldHover', borderColor: 'auth.fieldBorder', color: 'fg' }}
      _focusVisible={{
        boxShadow: '0 0 0 3px var(--chakra-colors-teal-focus-ring)',
      }}
      _disabled={{ cursor: 'not-allowed', opacity: '0.62' }}
      transition="background 160ms ease, border-color 160ms ease, color 160ms ease"
    >
      {loading ? <Loader2 size={20} className="arkivra-auth-spin" /> : icon}
      {label}
    </Button>
  );
}

function AuthBrandIcon({ svg }: { svg: string }) {
  return (
    <chakra.span
      aria-hidden="true"
      display="inline-block"
      boxSize="5"
      lineHeight="0"
      css={{
        '& svg': {
          display: 'block',
          height: '100%',
          width: '100%',
        },
      }}
      // eslint-disable-next-line react-dom/no-dangerously-set-innerhtml -- Local brand SVG assets are rendered inline so currentColor follows the OAuth button state.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
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
      className="arkivra-auth-link"
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
