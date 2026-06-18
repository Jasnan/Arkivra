import type { FormEvent } from 'react';
import type { SensitiveActionVerificationMethod } from '@/features/security/sensitive-action-verification.types';
import { useMemo, useState } from 'react';
import { Box, Grid, HStack, Stack, Text, chakra } from '@chakra-ui/react';
import { useMutation } from '@tanstack/react-query';
import { ChevronRight, ChevronUp, Info, Mail } from 'lucide-react';
import { ROUTES } from '@/app/routes';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { toast } from '@/components/ui/toaster-store';
import {
  OAUTH_PROVIDERS,
  requestEmailChange,
} from '@/features/security/sensitive-action-verification.types';
import { authClient } from '@/lib/auth-client';
import { SettingsFlatRow, SettingsStatusBadge } from '../components/settings-ui';

const securityActionButtonMinWidth = '9.5rem';
const securityInputStyleProps = {
  bg: 'bg.surface',
  borderColor: 'border',
  color: 'fg',
  _hover: { borderColor: 'border.strong' },
  _placeholder: { color: 'fg.subtle' },
} as const;

function getSecurityCallbackURL() {
  return new URL(ROUTES.settingsSecurity, window.location.origin).toString();
}

export function EmailAddressSettingsRow({
  canChangeEmail,
  currentEmail,
  isEmailVerified,
  verificationMethod,
}: {
  canChangeEmail: boolean;
  currentEmail: string;
  isEmailVerified: boolean;
  verificationMethod: SensitiveActionVerificationMethod;
}) {
  const [isEmailChangeOpen, setIsEmailChangeOpen] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailChangeError, setEmailChangeError] = useState<string | null>(null);

  const emailChangeDescription = useMemo(() => {
    if (canChangeEmail) {
      return 'To protect your account, confirm your password before changing your email address.';
    }

    if (verificationMethod.type === 'oauth') {
      return `Set a password before changing your Arkivra email. You can keep using ${OAUTH_PROVIDERS[verificationMethod.provider].label} after adding password sign-in.`;
    }

    return 'This account does not have a supported sign-in method for changing email yet.';
  }, [canChangeEmail, verificationMethod]);

  const emailMutation = useMutation({
    mutationFn: async () => {
      const callbackURL = new URL(ROUTES.settingsSecurity, window.location.origin).toString();
      const { error } = await authClient.sendVerificationEmail({
        email: currentEmail,
        callbackURL,
      });

      if (error) {
        throw new Error(error.message ?? 'Could not send verification email.');
      }
    },
    onSuccess: () => {
      toast.success('Verification email sent. Check your inbox to confirm your address.');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not send verification email.');
    },
  });

  const emailChangeMutation = useMutation({
    mutationFn: async ({ password: passwordValue }: { password?: string }) => {
      const normalizedEmail = newEmail.trim().toLowerCase();

      if (!normalizedEmail) {
        throw new Error('Enter a new email address.');
      }

      if (normalizedEmail === currentEmail.toLowerCase()) {
        throw new Error('Enter a different email address.');
      }

      return requestEmailChange({
        callbackURL: getSecurityCallbackURL(),
        newEmail: normalizedEmail,
        password: passwordValue,
      });
    },
    onSuccess: (result) => {
      toast.success(
        result.message ?? 'Email change requested. Check your email to confirm the change.',
      );
      setEmailChangeError(null);
      setIsEmailChangeOpen(false);
      setNewEmail('');
      setPassword('');
    },
    onError: (error) => {
      setEmailChangeError(
        error instanceof Error ? error.message : 'Could not request email change.',
      );
    },
  });

  async function handleEmailChangeSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setEmailChangeError(null);

    if (canChangeEmail) {
      emailChangeMutation.mutate({ password });
      return;
    }

    setEmailChangeError('Set a password before changing your email address.');
  }

  return (
    <SettingsFlatRow
      title="Email address"
      description={
        <Stack gap="0.5">
          <Text as="span" color="fg">
            {currentEmail || 'No email address available.'}
          </Text>
          <Text as="span" color="fg.muted">
            Used for sign-in, notifications, and security alerts.
          </Text>
        </Stack>
      }
      icon={<Mail size={21} strokeWidth={1.8} />}
      variant="card"
      actions={
        <HStack gap="4" flexWrap="wrap" justify={{ base: 'flex-start', md: 'flex-end' }}>
          <SettingsStatusBadge density="compact" tone={isEmailVerified ? 'verified' : 'warning'}>
            {isEmailVerified ? 'Verified' : 'Unverified'}
          </SettingsStatusBadge>
          {!isEmailVerified ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={emailMutation.isPending}
              onClick={() => {
                emailMutation.mutate();
              }}
            >
              {emailMutation.isPending ? 'Sending...' : 'Verify now'}
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="outline"
            minW={securityActionButtonMinWidth}
            onClick={() => {
              setIsEmailChangeOpen((open) => !open);
            }}
          >
            Change email
            {isEmailChangeOpen ? <ChevronUp size={16} /> : <ChevronRight size={16} />}
          </Button>
        </HStack>
      }
    >
      {isEmailChangeOpen ? (
        <Box mt="4" minW="0">
          <chakra.form onSubmit={handleEmailChangeSubmit}>
            <Grid
              templateColumns={{ base: '1fr', lg: 'minmax(0, 1fr) 22rem' }}
              gap={{ base: '5', lg: '7' }}
            >
              <Stack gap="3">
                <Stack gap="0.5">
                  <Text fontSize="sm" fontWeight="medium" color="fg">
                    Change email address
                  </Text>
                  <Text textStyle="sm" color="fg.muted">
                    {emailChangeDescription}
                  </Text>
                </Stack>

                <Field>
                  <FieldLabel htmlFor="security-current-email">Current email</FieldLabel>
                  <Input
                    id="security-current-email"
                    value={currentEmail}
                    disabled
                    {...securityInputStyleProps}
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor="security-new-email">New email</FieldLabel>
                  <Input
                    id="security-new-email"
                    type="email"
                    autoComplete="email"
                    required={canChangeEmail}
                    disabled={!canChangeEmail}
                    value={newEmail}
                    placeholder="Enter new email address"
                    onChange={(event) => setNewEmail(event.target.value)}
                    {...securityInputStyleProps}
                  />
                </Field>

                {canChangeEmail ? (
                  <Field>
                    <FieldLabel htmlFor="security-email-change-password">
                      Current password
                    </FieldLabel>
                    <PasswordInput
                      id="security-email-change-password"
                      autoComplete="current-password"
                      required
                      value={password}
                      placeholder="Enter your current password"
                      onChange={(event) => setPassword(event.target.value)}
                      {...securityInputStyleProps}
                    />
                  </Field>
                ) : null}

                {emailChangeError ? <FieldError>{emailChangeError}</FieldError> : null}

                <HStack justify="flex-end" gap="2.5">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setIsEmailChangeOpen(false);
                      setEmailChangeError(null);
                      setPassword('');
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    size="sm"
                    disabled={!canChangeEmail}
                    loading={emailChangeMutation.isPending}
                    loadingText="Sending..."
                  >
                    Send confirmation email
                  </Button>
                </HStack>
              </Stack>

              <Box
                borderLeftWidth={{ base: '0', lg: '1px' }}
                borderColor="border.muted"
                pl={{ base: '0', lg: '6' }}
              >
                <HStack
                  align="flex-start"
                  gap="3"
                  rounded="md"
                  borderWidth="1px"
                  borderColor="blue.muted"
                  bg="blue.subtle"
                  p="4"
                >
                  <Box color="blue.fg" flexShrink={0} mt="0.5">
                    <Info size={18} />
                  </Box>
                  <Stack gap="1">
                    <Text fontSize="sm" fontWeight="semibold" color="fg">
                      What happens next?
                    </Text>
                    <Text textStyle="sm" color="fg.muted">
                      We'll send a confirmation link to your current email address. Your new email
                      will be active once you confirm.
                    </Text>
                  </Stack>
                </HStack>
              </Box>
            </Grid>
          </chakra.form>
        </Box>
      ) : null}
    </SettingsFlatRow>
  );
}
