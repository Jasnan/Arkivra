import type { FormEvent } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Box, HStack, Stack, Text, chakra } from '@chakra-ui/react';
import { useMutation } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { ROUTES } from '@/app/routes';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useMeQuery } from '@/features/me/me.queries';
import {
  EMAIL_CHANGE_ACTION,
  OAUTH_PROVIDERS,
  PENDING_EMAIL_CHANGE_KEY,
  PENDING_SENSITIVE_ACTION_KEY,
  getSensitiveActionVerificationMethod,
  requestEmailChange,
} from '@/features/security/sensitive-action-verification.types';
import { authClient } from '@/lib/auth-client';
import { SettingsSessionsSection } from '../components/settings-sessions-section';
import {
  SettingsPageFrame,
  SettingsRow,
  SettingsRows,
  SettingsSection,
  SettingsStatusBadge,
} from '../components/settings-ui';

function settingsButtonLink(to: string, label: string) {
  return (
    <Link
      to={to}
      style={{
        alignItems: 'center',
        backgroundColor: 'var(--chakra-colors-teal-solid)',
        borderRadius: '0.5rem',
        color: 'var(--chakra-colors-fg-inverted)',
        display: 'inline-flex',
        fontSize: '0.875rem',
        fontWeight: 600,
        height: '2.25rem',
        justifyContent: 'center',
        minWidth: '10rem',
        padding: '0 0.875rem',
      }}
    >
      {label}
    </Link>
  );
}

function getSecurityCallbackURL() {
  return new URL(ROUTES.settingsSecurity, window.location.origin).toString();
}

function getPendingEmailChange() {
  if (typeof sessionStorage === 'undefined') {
    return '';
  }

  if (sessionStorage.getItem(PENDING_SENSITIVE_ACTION_KEY) !== EMAIL_CHANGE_ACTION) {
    return '';
  }

  return sessionStorage.getItem(PENDING_EMAIL_CHANGE_KEY) ?? '';
}

export function SecuritySettingsPage() {
  const { data: sessionData, isPending: sessionPending } = authClient.useSession();
  const meQuery = useMeQuery();
  const isEmailVerified = sessionData?.user.emailVerified === true;
  const isTwoFactorEnabled = sessionData?.user.twoFactorEnabled === true;
  const hasPassword = meQuery.data?.authMethods?.hasPassword !== false;
  const verificationMethod = getSensitiveActionVerificationMethod(meQuery.data?.authMethods);
  const [pendingEmailChange] = useState(getPendingEmailChange);
  const [isEmailChangeOpen, setIsEmailChangeOpen] = useState(Boolean(pendingEmailChange));
  const [newEmail, setNewEmail] = useState(pendingEmailChange);
  const [password, setPassword] = useState('');
  const [emailChangeError, setEmailChangeError] = useState<string | null>(null);
  const currentEmail = sessionData?.user.email ?? '';

  const emailChangeDescription = useMemo(() => {
    if (verificationMethod.type === 'password') {
      return 'Enter your current password. If your current email is verified, Arkivra will send a confirmation link there before applying the change.';
    }

    if (verificationMethod.type === 'oauth') {
      return `Confirm your ${OAUTH_PROVIDERS[verificationMethod.provider].label} account. If your current email is verified, Arkivra will send a confirmation link there before applying the change.`;
    }

    return 'This account does not have a supported sign-in method for changing email yet.';
  }, [verificationMethod]);

  const emailMutation = useMutation({
    mutationFn: async () => {
      const callbackURL = new URL(ROUTES.settingsSecurity, window.location.origin).toString();
      const { error } = await authClient.sendVerificationEmail({
        email: sessionData?.user.email ?? '',
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
      toast.success(result.message ?? 'Email change requested. Check your email to confirm the change.');
      sessionStorage.removeItem(PENDING_EMAIL_CHANGE_KEY);
      sessionStorage.removeItem(PENDING_SENSITIVE_ACTION_KEY);
      setEmailChangeError(null);
      setIsEmailChangeOpen(false);
      setNewEmail('');
      setPassword('');
    },
    onError: (error) => {
      setEmailChangeError(error instanceof Error ? error.message : 'Could not request email change.');
    },
  });

  useEffect(() => {
    if (verificationMethod.type !== 'oauth' || emailChangeMutation.isPending) {
      return;
    }

    if (!pendingEmailChange) {
      return;
    }

    emailChangeMutation.mutate({});
  }, [emailChangeMutation, pendingEmailChange, verificationMethod.type]);

  async function handleEmailChangeSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setEmailChangeError(null);

    if (verificationMethod.type === 'password') {
      emailChangeMutation.mutate({ password });
      return;
    }

    if (verificationMethod.type === 'oauth') {
      const normalizedEmail = newEmail.trim().toLowerCase();

      if (!normalizedEmail) {
        setEmailChangeError('Enter a new email address.');
        return;
      }

      if (normalizedEmail === currentEmail.toLowerCase()) {
        setEmailChangeError('Enter a different email address.');
        return;
      }

      sessionStorage.setItem(PENDING_EMAIL_CHANGE_KEY, normalizedEmail);
      sessionStorage.setItem(PENDING_SENSITIVE_ACTION_KEY, EMAIL_CHANGE_ACTION);
      await authClient.signIn.social({
        provider: verificationMethod.provider,
        callbackURL: getSecurityCallbackURL(),
      });
    }
  }

  if (sessionPending) {
    return <Text textStyle="sm">Loading security settings...</Text>;
  }

  return (
    <SettingsPageFrame title="Security">
      <Stack gap="4" maxW="5xl">
        <SettingsSection title="Two-factor authentication" description="Protect your account with an authenticator app.">
          <SettingsRows>
            <SettingsRow
              label="Authenticator app"
              description={isTwoFactorEnabled
                ? 'Your account requires an authenticator code at sign-in.'
                : 'Warning: add a second sign-in step before relying on this instance for sensitive documents.'}
              control={
                <HStack gap="3">
                  <SettingsStatusBadge tone={isTwoFactorEnabled ? 'enabled' : 'warning'}>
                    {isTwoFactorEnabled ? 'Enabled' : 'Disabled'}
                  </SettingsStatusBadge>
                  {settingsButtonLink(isTwoFactorEnabled ? ROUTES.twoFactorManage : ROUTES.twoFactorSetup, isTwoFactorEnabled ? 'Manage 2FA' : 'Enable 2FA')}
                </HStack>
              }
            />
          </SettingsRows>
        </SettingsSection>

        <SettingsSection title="Password management" description="Control password-based access for this account.">
          <SettingsRows>
            <SettingsRow
              label="Password"
              description={hasPassword ? 'Password sign-in is available for this account.' : 'This account currently uses linked OAuth sign-in.'}
              control={
                <HStack gap="3">
                  <SettingsStatusBadge tone={hasPassword ? 'enabled' : 'inactive'}>
                    {hasPassword ? 'Enabled' : 'Inactive'}
                  </SettingsStatusBadge>
                  {settingsButtonLink(ROUTES.requestPasswordReset, hasPassword ? 'Change password' : 'Set password')}
                </HStack>
              }
            />
          </SettingsRows>
        </SettingsSection>

        <SettingsSection title="Email verification" description="Verified email keeps account recovery and notifications reliable.">
          <SettingsRows>
            <SettingsRow
              label="Primary email"
              description={sessionData?.user.email ?? 'No email address available.'}
              control={
                <HStack gap="3">
                  <SettingsStatusBadge tone={isEmailVerified ? 'verified' : 'warning'}>
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
                    onClick={() => {
                      setIsEmailChangeOpen((open) => !open);
                    }}
                  >
                    <Pencil size={15} />
                    Change email
                  </Button>
                </HStack>
              }
            />
          </SettingsRows>
          {isEmailChangeOpen ? (
            <Box rounded="md" borderWidth="1px" borderColor="border.subtle" bg="bg.subtle" p="4">
              <chakra.form onSubmit={handleEmailChangeSubmit}>
                <Stack gap="4">
                  <Stack gap="1">
                    <Text fontSize="sm" fontWeight="medium" color="fg">
                      Change email address
                    </Text>
                    <Text textStyle="sm" color="fg.muted">
                      {emailChangeDescription}
                    </Text>
                  </Stack>

                  <Field maxW="md">
                    <FieldLabel htmlFor="security-new-email">New email</FieldLabel>
                    <Input
                      id="security-new-email"
                      type="email"
                      autoComplete="email"
                      required
                      value={newEmail}
                      placeholder="new@example.com"
                      onChange={(event) => setNewEmail(event.target.value)}
                    />
                  </Field>

                  {verificationMethod.type === 'password' ? (
                    <Field maxW="md">
                      <FieldLabel htmlFor="security-email-change-password">Current password</FieldLabel>
                      <Input
                        id="security-email-change-password"
                        type="password"
                        autoComplete="current-password"
                        required
                        value={password}
                        placeholder="Current password"
                        onChange={(event) => setPassword(event.target.value)}
                      />
                    </Field>
                  ) : null}

                  {emailChangeError ? <FieldError>{emailChangeError}</FieldError> : null}

                  <HStack justify="flex-end" gap="3">
                    <Button
                      type="button"
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
                      disabled={verificationMethod.type === 'unavailable'}
                      loading={emailChangeMutation.isPending}
                      loadingText="Requesting..."
                    >
                      {verificationMethod.type === 'oauth'
                        ? `Continue with ${OAUTH_PROVIDERS[verificationMethod.provider].label}`
                        : 'Request change'}
                    </Button>
                  </HStack>
                </Stack>
              </chakra.form>
            </Box>
          ) : null}
        </SettingsSection>

        <SettingsSessionsSection />
      </Stack>
    </SettingsPageFrame>
  );
}
