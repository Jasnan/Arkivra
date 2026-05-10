import type { FormEvent, ReactNode } from 'react';
import type { SensitiveActionVerificationMethod } from './sensitive-action-verification.types';
import { HStack, Stack, Text, VStack, chakra } from '@chakra-ui/react';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { authClient } from '@/lib/auth-client';
import { OAUTH_PROVIDERS, PENDING_SENSITIVE_ACTION_KEY } from './sensitive-action-verification.types';

export function SensitiveActionVerificationStep({
  actionLabel,
  errorMessage,
  isPending,
  method,
  password,
  setPassword,
  onCancel,
  onPasswordSubmit,
}: {
  actionLabel: string;
  errorMessage: string | null;
  isPending: boolean;
  method: SensitiveActionVerificationMethod;
  password: string;
  setPassword: (value: string) => void;
  onCancel: () => void;
  onPasswordSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  if (method.type === 'password') {
    return (
      <chakra.form onSubmit={onPasswordSubmit}>
        <VStack align="stretch" gap="5">
          <VerificationHeading
            title="Verify your identity"
            description="For security reasons, enter your current password before continuing."
          />

          <Field maxW="sm">
            <FieldLabel htmlFor="sensitive-action-password">Current password</FieldLabel>
            <Input
              id="sensitive-action-password"
              type="password"
              required
              autoComplete="current-password"
              placeholder="Current password"
              value={password}
              aria-invalid={errorMessage ? true : undefined}
              onChange={(event) => setPassword(event.target.value)}
            />
          </Field>

          <VerificationActions
            errorMessage={errorMessage}
            onCancel={onCancel}
          >
            <Button type="submit" loading={isPending} loadingText={actionLabel}>
              Continue
              <ArrowRight size={16} />
            </Button>
          </VerificationActions>
        </VStack>
      </chakra.form>
    );
  }

  if (method.type === 'oauth') {
    const provider = OAUTH_PROVIDERS[method.provider];

    return (
      <VStack align="stretch" gap="5">
        <VerificationHeading
          title="Verify your identity"
          description={`For security reasons, confirm your ${provider.label} account before continuing.`}
        />

        <Text fontSize="sm" color="fg.muted" maxW="lg">
          You will return to this setup flow after confirming your account.
        </Text>

        <VerificationActions
          errorMessage={errorMessage}
          onCancel={onCancel}
        >
          <Button
            type="button"
            loading={isPending}
            loadingText={`Opening ${provider.label}`}
            onClick={async () => {
              sessionStorage.setItem(PENDING_SENSITIVE_ACTION_KEY, 'two-factor-setup');
              await authClient.signIn.social({
                provider: method.provider,
                callbackURL: window.location.href,
              });
            }}
          >
            Continue with {provider.label}
            <ArrowRight size={16} />
          </Button>
        </VerificationActions>
      </VStack>
    );
  }

  return (
    <VStack align="stretch" gap="5">
      <VerificationHeading
        title="Verify your identity"
        description="This account does not have a supported sign-in method for identity verification yet."
      />
      <VerificationActions
        errorMessage={errorMessage}
        onCancel={onCancel}
      />
    </VStack>
  );
}

function VerificationHeading({
  description,
  title,
}: {
  description: string;
  title: string;
}) {
  return (
    <Stack gap="1">
      <Text fontSize="lg" fontWeight="semibold" color="fg">
        {title}
      </Text>
      <Text fontSize="sm" color="fg.muted">
        {description}
      </Text>
    </Stack>
  );
}

function VerificationActions({
  children,
  errorMessage,
  onCancel,
}: {
  children?: ReactNode;
  errorMessage: string | null;
  onCancel: () => void;
}) {
  return (
    <>
      {errorMessage ? <FieldError>{errorMessage}</FieldError> : null}

      <HStack justify="space-between" gap="3">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        {children ?? (
          <Button type="button" disabled>
            Continue
          </Button>
        )}
      </HStack>
    </>
  );
}
