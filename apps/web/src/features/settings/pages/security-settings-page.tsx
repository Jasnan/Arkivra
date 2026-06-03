import type { FormEvent } from 'react';
import type { OAuthProviderId, SensitiveActionVerificationMethod } from '@/features/security/sensitive-action-verification.types';
import { useEffect, useMemo, useState } from 'react';
import { Box, HStack, Stack, Text, chakra } from '@chakra-ui/react';
import { useMutation } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Link2, LockKeyhole, Mail, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { ROUTES } from '@/app/routes';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useMeQuery } from '@/features/me/me.queries';
import {
  OAUTH_PROVIDERS,
  PENDING_SENSITIVE_ACTION_KEY,
  SET_PASSWORD_ACTION,
  changeAccountPassword,
  getSensitiveActionVerificationMethod,
  linkOAuthAccount,
  requestEmailChange,
  setAccountPassword,
} from '@/features/security/sensitive-action-verification.types';
import { ApiError } from '@/lib/api';
import { authClient } from '@/lib/auth-client';
import { SettingsSessionsSection } from '../components/settings-sessions-section';
import {
  SettingsFlatRow,
  SettingsFlatRows,
  SettingsPageFrame,
  SettingsStatusBadge,
} from '../components/settings-ui';

const securityActionButtonMinWidth = '9.5rem';
const passwordInputStyleProps = {
  bg: 'bg.surface',
  borderColor: 'border',
  color: 'fg',
  _focusVisible: {
    borderColor: 'teal.solid',
    boxShadow: '0 0 0 1px var(--chakra-colors-teal-solid)',
    outline: '2px solid',
    outlineColor: 'teal.focusRing',
    outlineOffset: '1px',
  },
  _hover: { borderColor: 'border.strong' },
  _placeholder: { color: 'fg.subtle' },
} as const;

function settingsButtonLink(to: string, label: string, variant: 'solid' | 'outline' = 'solid') {
  const isSolid = variant === 'solid';

  return (
    <Link
      to={to}
      style={{
        alignItems: 'center',
        backgroundColor: isSolid ? 'var(--chakra-colors-teal-solid)' : 'var(--chakra-colors-bg-surface)',
        border: isSolid ? '1px solid var(--chakra-colors-teal-solid)' : '1px solid var(--chakra-colors-border)',
        borderRadius: '0.375rem',
        color: isSolid ? 'var(--chakra-colors-fg-inverted)' : 'var(--chakra-colors-fg)',
        display: 'inline-flex',
        fontSize: '0.875rem',
        fontWeight: 600,
        height: '2.125rem',
        justifyContent: 'center',
        minWidth: securityActionButtonMinWidth,
        padding: '0 0.75rem',
      }}
    >
      {label}
    </Link>
  );
}

function getSecurityCallbackURL() {
  return new URL(ROUTES.settingsSecurity, window.location.origin).toString();
}

function hasPendingSetPassword() {
  if (typeof sessionStorage === 'undefined') {
    return false;
  }

  return sessionStorage.getItem(PENDING_SENSITIVE_ACTION_KEY) === SET_PASSWORD_ACTION;
}

function clearPendingSetPassword() {
  if (typeof sessionStorage === 'undefined') {
    return;
  }

  if (sessionStorage.getItem(PENDING_SENSITIVE_ACTION_KEY) === SET_PASSWORD_ACTION) {
    sessionStorage.removeItem(PENDING_SENSITIVE_ACTION_KEY);
  }
}

function TwoFactorSettingsRow({ isTwoFactorEnabled }: { isTwoFactorEnabled: boolean }) {
  return (
    <SettingsFlatRow
      title="Two-factor authentication"
      description={isTwoFactorEnabled
        ? 'Your account requires an authenticator code at sign-in.'
        : 'Add a second sign-in step to keep your account and documents secure.'}
      icon={<ShieldCheck size={21} strokeWidth={1.8} />}
      actions={(
        <HStack gap="4" flexWrap="wrap" justify={{ base: 'flex-start', md: 'flex-end' }}>
          <SettingsStatusBadge density="compact" tone={isTwoFactorEnabled ? 'enabled' : 'warning'}>
            {isTwoFactorEnabled ? 'Enabled' : 'Disabled'}
          </SettingsStatusBadge>
          {settingsButtonLink(isTwoFactorEnabled ? ROUTES.twoFactorManage : ROUTES.twoFactorSetup, isTwoFactorEnabled ? 'Manage 2FA' : 'Enable 2FA')}
        </HStack>
      )}
    />
  );
}

function PasswordSettingsRow({
  hasPassword,
  onPasswordEnabled,
  verificationMethod,
}: {
  hasPassword: boolean;
  onPasswordEnabled: () => void;
  verificationMethod: SensitiveActionVerificationMethod;
}) {
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const [isSetPasswordOpen, setIsSetPasswordOpen] = useState(hasPendingSetPassword);

  return (
    <SettingsFlatRow
      title="Password"
      description={hasPassword
        ? 'Password sign-in is available for this account.'
        : 'This account currently uses linked OAuth sign-in. You can set a password to sign in directly.'}
      icon={<LockKeyhole size={21} strokeWidth={1.8} />}
      actions={(
        <HStack gap="4" flexWrap="wrap" justify={{ base: 'flex-start', md: 'flex-end' }}>
          <SettingsStatusBadge density="compact" tone={hasPassword ? 'enabled' : 'inactive'}>
            {hasPassword ? 'Enabled' : 'Inactive'}
          </SettingsStatusBadge>
          {hasPassword ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              minW={securityActionButtonMinWidth}
              onClick={() => {
                setIsChangePasswordOpen((open) => !open);
              }}
            >
              Change password
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="outline"
              minW={securityActionButtonMinWidth}
              onClick={() => {
                setIsSetPasswordOpen((open) => !open);
              }}
            >
              Set password
            </Button>
          )}
        </HStack>
      )}
    >
      {hasPassword && isChangePasswordOpen ? (
        <ChangePasswordForm
          onCancel={() => setIsChangePasswordOpen(false)}
        />
      ) : null}
      {!hasPassword && isSetPasswordOpen ? (
        <SetPasswordForm
          onCancel={() => setIsSetPasswordOpen(false)}
          onPasswordEnabled={() => {
            setIsSetPasswordOpen(false);
            onPasswordEnabled();
          }}
          verificationMethod={verificationMethod}
        />
      ) : null}
    </SettingsFlatRow>
  );
}

function ConnectedSignInSettingsRow({
  hasPassword,
  oauthProviders,
}: {
  hasPassword: boolean;
  oauthProviders: string[];
}) {
  const [selectedProvider, setSelectedProvider] = useState<OAuthProviderId | null>(null);
  const connectedProviders = new Set(oauthProviders);
  const linkableProviders = Object.keys(OAUTH_PROVIDERS) as OAuthProviderId[];
  const hasMissingProvider = linkableProviders.some(provider => !connectedProviders.has(provider));

  return (
    <SettingsFlatRow
      title="Connected sign-in"
      description={hasPassword
        ? 'Connect Google or GitHub from this signed-in account.'
        : 'Set a password before connecting another sign-in provider.'}
      icon={<Link2 size={21} strokeWidth={1.8} />}
      actions={(
        <HStack gap="3" flexWrap="wrap" justify={{ base: 'flex-start', md: 'flex-end' }}>
          {linkableProviders.map((provider) => {
            const isConnected = connectedProviders.has(provider);

            return (
              <HStack key={provider} gap="2">
                <SettingsStatusBadge density="compact" tone={isConnected ? 'enabled' : 'inactive'}>
                  {OAUTH_PROVIDERS[provider].label}
                </SettingsStatusBadge>
                {!isConnected ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={!hasPassword}
                    onClick={() => setSelectedProvider(provider)}
                  >
                    Connect
                  </Button>
                ) : null}
              </HStack>
            );
          })}
        </HStack>
      )}
    >
      {selectedProvider && hasPassword ? (
        <LinkOAuthProviderForm
          provider={selectedProvider}
          onCancel={() => setSelectedProvider(null)}
        />
      ) : !hasMissingProvider ? (
        <Text textStyle="sm" color="fg.muted">
          All configured sign-in providers are connected.
        </Text>
      ) : null}
    </SettingsFlatRow>
  );
}

function LinkOAuthProviderForm({
  onCancel,
  provider,
}: {
  onCancel: () => void;
  provider: OAuthProviderId;
}) {
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLinking, setIsLinking] = useState(false);
  const providerLabel = OAUTH_PROVIDERS[provider].label;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setIsLinking(true);

    try {
      const result = await linkOAuthAccount({
        callbackURL: getSecurityCallbackURL(),
        password,
        provider,
      });

      if (result.redirect && result.url) {
        window.location.assign(result.url);
        return;
      }

      toast.success(`${providerLabel} is connected.`);
      onCancel();
      setPassword('');
    }
    catch (error) {
      setErrorMessage(error instanceof Error ? error.message : `Could not connect ${providerLabel}.`);
    }
    finally {
      setIsLinking(false);
    }
  }

  return (
    <Box rounded="md" borderWidth="1px" borderColor="border.surface" bg="bg.subtle" p="3">
      <chakra.form onSubmit={handleSubmit}>
        <Stack gap="3">
          <Stack gap="0.5">
            <Text fontSize="sm" fontWeight="medium" color="fg">
              Connect {providerLabel}
            </Text>
            <Text textStyle="sm" color="fg.muted">
              Enter your current password before connecting this provider.
            </Text>
          </Stack>

          <Field maxW="md">
            <FieldLabel htmlFor={`security-link-${provider}-password`}>Current password</FieldLabel>
            <Input
              id={`security-link-${provider}-password`}
              type="password"
              autoComplete="current-password"
              required
              value={password}
              placeholder="Current password"
              onChange={(event) => setPassword(event.target.value)}
              {...passwordInputStyleProps}
            />
          </Field>

          {errorMessage ? <FieldError>{errorMessage}</FieldError> : null}

          <HStack justify="flex-end" gap="2.5">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                onCancel();
                setErrorMessage(null);
                setPassword('');
              }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              loading={isLinking}
              loadingText="Connecting..."
            >
              Continue
            </Button>
          </HStack>
        </Stack>
      </chakra.form>
    </Box>
  );
}

function ChangePasswordForm({ onCancel }: { onCancel: () => void }) {
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [changedPassword, setChangedPassword] = useState('');
  const [confirmChangedPassword, setConfirmChangedPassword] = useState('');
  const [changePasswordError, setChangePasswordError] = useState<string | null>(null);

  function resetForm() {
    setChangePasswordError(null);
    setCurrentPassword('');
    setChangedPassword('');
    setConfirmChangedPassword('');
  }

  async function handleChangePasswordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setChangePasswordError(null);

    try {
      if (changedPassword.length < 8) {
        throw new Error('Password must be at least 8 characters.');
      }

      if (changedPassword !== confirmChangedPassword) {
        throw new Error('Passwords do not match.');
      }

      setIsChangingPassword(true);
      await changeAccountPassword({
        currentPassword,
        newPassword: changedPassword,
      });

      toast.success('Password updated.');
      onCancel();
      resetForm();
    }
    catch (error) {
      setChangePasswordError(error instanceof Error ? error.message : 'Could not change password.');
    }
    finally {
      setIsChangingPassword(false);
    }
  }

  return (
    <Box rounded="md" borderWidth="1px" borderColor="border.surface" bg="bg.subtle" p="3">
      <chakra.form onSubmit={handleChangePasswordSubmit}>
        <Stack gap="3">
          <Stack gap="0.5">
            <Text fontSize="sm" fontWeight="medium" color="fg">
              Change password
            </Text>
            <Text textStyle="sm" color="fg.muted">
              Enter your current password and choose a new password for direct sign-in.
            </Text>
          </Stack>

          <Field maxW="md">
            <FieldLabel htmlFor="security-current-password">Current password</FieldLabel>
            <Input
              id="security-current-password"
              type="password"
              autoComplete="current-password"
              required
              value={currentPassword}
              placeholder="Current password"
              onChange={(event) => setCurrentPassword(event.target.value)}
              {...passwordInputStyleProps}
            />
          </Field>

          <Field maxW="md">
            <FieldLabel htmlFor="security-change-new-password">New password</FieldLabel>
            <Input
              id="security-change-new-password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={changedPassword}
              placeholder="Create a strong password"
              onChange={(event) => setChangedPassword(event.target.value)}
              {...passwordInputStyleProps}
            />
          </Field>

          <Field maxW="md">
            <FieldLabel htmlFor="security-change-confirm-password">Confirm password</FieldLabel>
            <Input
              id="security-change-confirm-password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={confirmChangedPassword}
              placeholder="Repeat the new password"
              onChange={(event) => setConfirmChangedPassword(event.target.value)}
              {...passwordInputStyleProps}
            />
          </Field>

          {changePasswordError ? <FieldError>{changePasswordError}</FieldError> : null}

          <HStack justify="flex-end" gap="2.5">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                onCancel();
                resetForm();
              }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              loading={isChangingPassword}
              loadingText="Updating password..."
            >
              Save
            </Button>
          </HStack>
        </Stack>
      </chakra.form>
    </Box>
  );
}

function SetPasswordForm({
  onCancel,
  onPasswordEnabled,
  verificationMethod,
}: {
  onCancel: () => void;
  onPasswordEnabled: () => void;
  verificationMethod: SensitiveActionVerificationMethod;
}) {
  const [isSettingPassword, setIsSettingPassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [setPasswordError, setSetPasswordError] = useState<string | null>(null);
  const [needsSetPasswordOAuthVerification, setNeedsSetPasswordOAuthVerification] = useState(false);

  function resetForm() {
    setSetPasswordError(null);
    setNeedsSetPasswordOAuthVerification(false);
    setNewPassword('');
    setConfirmPassword('');
  }

  function handleSetPasswordSuccess() {
    toast.success('Password sign-in enabled.');
    resetForm();
    clearPendingSetPassword();
    onPasswordEnabled();
  }

  async function handleSetPasswordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSetPasswordError(null);
    setNeedsSetPasswordOAuthVerification(false);

    try {
      if (newPassword.length < 8) {
        throw new Error('Password must be at least 8 characters.');
      }

      if (newPassword !== confirmPassword) {
        throw new Error('Passwords do not match.');
      }

      setIsSettingPassword(true);
      await setAccountPassword({ newPassword });
      handleSetPasswordSuccess();
    }
    catch (error) {
      if (error instanceof ApiError && error.status === 403 && verificationMethod.type === 'oauth') {
        setNeedsSetPasswordOAuthVerification(true);
      }

      setSetPasswordError(error instanceof Error ? error.message : 'Could not set password.');
    }
    finally {
      setIsSettingPassword(false);
    }
  }

  async function handleSetPasswordOAuthVerification() {
    if (verificationMethod.type !== 'oauth') {
      return;
    }

    sessionStorage.setItem(PENDING_SENSITIVE_ACTION_KEY, SET_PASSWORD_ACTION);
    await authClient.signIn.social({
      provider: verificationMethod.provider,
      callbackURL: getSecurityCallbackURL(),
    });
  }

  return (
    <Box rounded="md" borderWidth="1px" borderColor="border.surface" bg="bg.subtle" p="3">
      <chakra.form onSubmit={handleSetPasswordSubmit}>
        <Stack gap="3">
          <Stack gap="0.5">
            <Text fontSize="sm" fontWeight="medium" color="fg">
              Set password
            </Text>
            <Text textStyle="sm" color="fg.muted">
              Add password sign-in to this OAuth account. You can keep using your linked provider after setting a password.
            </Text>
          </Stack>

          <Field maxW="md">
            <FieldLabel htmlFor="security-new-password">New password</FieldLabel>
            <Input
              id="security-new-password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={newPassword}
              placeholder="Create a strong password"
              onChange={(event) => setNewPassword(event.target.value)}
              {...passwordInputStyleProps}
            />
          </Field>

          <Field maxW="md">
            <FieldLabel htmlFor="security-confirm-password">Confirm password</FieldLabel>
            <Input
              id="security-confirm-password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={confirmPassword}
              placeholder="Repeat the new password"
              onChange={(event) => setConfirmPassword(event.target.value)}
              {...passwordInputStyleProps}
            />
          </Field>

          {setPasswordError ? <FieldError>{setPasswordError}</FieldError> : null}

          <HStack justify="flex-end" gap="2.5">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                onCancel();
                resetForm();
                clearPendingSetPassword();
              }}
            >
              Cancel
            </Button>
            {needsSetPasswordOAuthVerification && verificationMethod.type === 'oauth' ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleSetPasswordOAuthVerification}
              >
                Continue with {OAUTH_PROVIDERS[verificationMethod.provider].label}
              </Button>
            ) : null}
            <Button
              type="submit"
              size="sm"
              loading={isSettingPassword}
              loadingText="Setting password..."
            >
              Save
            </Button>
          </HStack>
        </Stack>
      </chakra.form>
    </Box>
  );
}

export function SecuritySettingsPage() {
  const { data: sessionData, isPending: sessionPending } = authClient.useSession();
  const meQuery = useMeQuery();
  const isEmailVerified = sessionData?.user.emailVerified === true;
  const isTwoFactorEnabled = sessionData?.user.twoFactorEnabled === true;
  const hasPassword = meQuery.data?.authMethods?.hasPassword !== false;
  const oauthProviders = meQuery.data?.authMethods?.oauthProviders ?? [];
  const verificationMethod = getSensitiveActionVerificationMethod(meQuery.data?.authMethods);
  const canChangeEmail = verificationMethod.type === 'password';
  const [isEmailChangeOpen, setIsEmailChangeOpen] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailChangeError, setEmailChangeError] = useState<string | null>(null);
  const currentEmail = sessionData?.user.email ?? '';

  const emailChangeDescription = useMemo(() => {
    if (canChangeEmail) {
      return 'Enter your current password. If your current email is verified, Arkivra will send a confirmation link there before applying the change.';
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
      setEmailChangeError(null);
      setIsEmailChangeOpen(false);
      setNewEmail('');
      setPassword('');
    },
    onError: (error) => {
      setEmailChangeError(error instanceof Error ? error.message : 'Could not request email change.');
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

  if (sessionPending) {
    return <Text textStyle="sm">Loading security settings...</Text>;
  }

  return (
    <SettingsPageFrame
      title="Security"
      description="Manage how you sign in and protect your Arkivra account."
      density="compact"
    >
      <Box maxW="6xl">
        <SettingsFlatRows>
          <TwoFactorSettingsRow isTwoFactorEnabled={isTwoFactorEnabled} />

          <PasswordSettingsRow
            hasPassword={hasPassword}
            onPasswordEnabled={() => {
              void meQuery.refetch();
            }}
            verificationMethod={verificationMethod}
          />

          <ConnectedSignInSettingsRow
            hasPassword={hasPassword}
            oauthProviders={oauthProviders}
          />

          <SettingsFlatRow
            title="Email verification"
            description={isEmailVerified ? 'Your primary email is verified.' : sessionData?.user.email ?? 'No email address available.'}
            icon={<Mail size={21} strokeWidth={1.8} />}
            actions={(
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
                </Button>
              </HStack>
            )}
          >
          {isEmailChangeOpen ? (
            <Box rounded="md" borderWidth="1px" borderColor="border.surface" bg="bg.subtle" p="3">
              <chakra.form onSubmit={handleEmailChangeSubmit}>
                <Stack gap="3">
                  <Stack gap="0.5">
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
                      required={canChangeEmail}
                      disabled={!canChangeEmail}
                      value={newEmail}
                      placeholder="new@example.com"
                      onChange={(event) => setNewEmail(event.target.value)}
                    />
                  </Field>

                  {canChangeEmail ? (
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
                      loadingText="Requesting..."
                    >
                      Request
                    </Button>
                  </HStack>
                </Stack>
              </chakra.form>
            </Box>
          ) : null}
          </SettingsFlatRow>

          <SettingsSessionsSection />
        </SettingsFlatRows>
      </Box>
    </SettingsPageFrame>
  );
}
