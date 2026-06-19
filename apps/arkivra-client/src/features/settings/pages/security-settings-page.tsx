import type { FormEvent, ReactNode } from 'react';
import type {
  OAuthProviderId,
  SensitiveActionVerificationMethod,
} from '@/features/security/sensitive-action-verification.types';
import { Fragment, useState } from 'react';
import { Box, Flex, Grid, HStack, IconButton, Stack, Text, chakra } from '@chakra-ui/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronRight, ChevronUp, Link2, LockKeyhole } from 'lucide-react';
import { toast } from '@/components/ui/toaster-store';
import githubBrandSvg from '@/assets/brand-github.svg?raw';
import googleBrandSvg from '@/assets/brand-google.svg?raw';
import { ROUTES } from '@/app/routes';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { PasswordInput, PasswordStrengthMeter } from '@/components/ui/password-input';
import { meQueryKeys, useMeQuery } from '@/features/me/me.queries';
import {
  OAUTH_PROVIDERS,
  PENDING_SENSITIVE_ACTION_KEY,
  SET_PASSWORD_ACTION,
  changeAccountPassword,
  getSensitiveActionVerificationMethod,
  linkOAuthAccount,
  setAccountPassword,
  unlinkOAuthAccount,
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
import { EmailAddressSettingsRow } from './security-settings-email';
import { TwoFactorSettingsRow } from './security-settings-two-factor';

const securityActionButtonMinWidth = '9.5rem';
const PASSWORD_UPPERCASE_REGEX = /[A-Z]/;
const PASSWORD_LOWERCASE_REGEX = /[a-z]/;
const PASSWORD_NUMBER_REGEX = /\d/;
const PASSWORD_SPECIAL_REGEX = /[^A-Z0-9]/i;
const OAUTH_PROVIDER_MARKS: Record<OAuthProviderId, string> = {
  github: githubBrandSvg,
  google: googleBrandSvg,
};
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

function InlineSecurityPanel({ children }: { children: ReactNode }) {
  return (
    <Box mt="4" minW="0">
      {children}
    </Box>
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
      description={
        hasPassword
          ? 'Use a password to sign in to your Arkivra account.'
          : 'This account currently uses linked OAuth sign-in. You can set a password to sign in directly.'
      }
      icon={<LockKeyhole size={21} strokeWidth={1.8} />}
      variant="card"
      actions={
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
              {isChangePasswordOpen ? <ChevronUp size={16} /> : <ChevronRight size={16} />}
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
              {isSetPasswordOpen ? <ChevronUp size={16} /> : <ChevronRight size={16} />}
            </Button>
          )}
        </HStack>
      }
    >
      {hasPassword && isChangePasswordOpen ? (
        <InlineSecurityPanel>
          <ChangePasswordForm onCancel={() => setIsChangePasswordOpen(false)} />
        </InlineSecurityPanel>
      ) : null}
      {!hasPassword && isSetPasswordOpen ? (
        <InlineSecurityPanel>
          <SetPasswordForm
            onCancel={() => setIsSetPasswordOpen(false)}
            onPasswordEnabled={() => {
              setIsSetPasswordOpen(false);
              onPasswordEnabled();
            }}
            verificationMethod={verificationMethod}
          />
        </InlineSecurityPanel>
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
  const queryClient = useQueryClient();
  const [isManageConnectionsOpen, setIsManageConnectionsOpen] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<OAuthProviderId | null>(null);
  const connectedProviders = new Set(oauthProviders);
  const linkableProviders = Object.keys(OAUTH_PROVIDERS) as OAuthProviderId[];
  const connectedOAuthProviders = linkableProviders.filter((provider) =>
    connectedProviders.has(provider),
  );
  const isConnectionsOpen = isManageConnectionsOpen || selectedProvider !== null;
  const disconnectMutation = useMutation({
    mutationFn: unlinkOAuthAccount,
    onSuccess: async (_result, { provider }) => {
      setSelectedProvider(null);
      toast.success(`${OAUTH_PROVIDERS[provider].label} is disconnected.`);
      await queryClient.invalidateQueries({ queryKey: meQueryKeys.all });
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : 'Could not disconnect sign-in provider.',
      );
    },
  });

  function handleManageConnectionsToggle() {
    setIsManageConnectionsOpen((open) => {
      if (open) {
        setSelectedProvider(null);
      }

      return !open;
    });
  }

  return (
    <SettingsFlatRow
      title="Connected sign-in"
      description="Add trusted sign-in providers to your account. You can continue using your password at any time."
      icon={<Link2 size={21} strokeWidth={1.8} />}
      variant="card"
      actions={
        <Button
          type="button"
          size="sm"
          variant="outline"
          minW={securityActionButtonMinWidth}
          onClick={handleManageConnectionsToggle}
        >
          Manage connections
          {isConnectionsOpen ? <ChevronUp size={16} /> : <ChevronRight size={16} />}
        </Button>
      }
    >
      {isConnectionsOpen ? (
        <InlineSecurityPanel>
          <Stack gap="4">
            <Box
              rounded="md"
              borderWidth="1px"
              borderColor="border"
              bg="bg.surface"
              overflow="hidden"
            >
              <Stack gap="0" divideY="1px" divideColor="border.surface">
                {linkableProviders.map((provider) => {
                  const isConnected = connectedProviders.has(provider);
                  const canDisconnect =
                    isConnected &&
                    (hasPassword || connectedOAuthProviders.some((other) => other !== provider));
                  const isSelected = selectedProvider === provider;

                  return (
                    <Fragment key={provider}>
                      <ConnectedSignInProviderRow
                        provider={provider}
                        isConnected={isConnected}
                        isSelected={isSelected}
                        canConnect={hasPassword}
                        canDisconnect={canDisconnect}
                        isDisconnecting={
                          disconnectMutation.isPending &&
                          disconnectMutation.variables?.provider === provider
                        }
                        onConnect={() => setSelectedProvider(isSelected ? null : provider)}
                        onDisconnect={() => disconnectMutation.mutate({ provider })}
                      />
                      {isSelected && hasPassword ? (
                        <LinkOAuthProviderForm
                          provider={provider}
                          onCancel={() => setSelectedProvider(null)}
                        />
                      ) : null}
                    </Fragment>
                  );
                })}
              </Stack>
            </Box>

            {!hasPassword ? (
              <Text textStyle="sm" color="fg.muted">
                Set a password before connecting another sign-in provider.
              </Text>
            ) : null}
          </Stack>
        </InlineSecurityPanel>
      ) : null}
    </SettingsFlatRow>
  );
}

function ConnectedSignInProviderRow({
  canDisconnect,
  canConnect,
  isDisconnecting,
  isConnected,
  isSelected,
  onConnect,
  onDisconnect,
  provider,
}: {
  canDisconnect: boolean;
  canConnect: boolean;
  isDisconnecting: boolean;
  isConnected: boolean;
  isSelected: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  provider: OAuthProviderId;
}) {
  const providerLabel = OAUTH_PROVIDERS[provider].label;

  return (
    <Flex
      align={{ base: 'flex-start', md: 'center' }}
      gap={{ base: '3', md: '4' }}
      px={{ base: '4', md: '5' }}
      py="4"
      direction={{ base: 'column', sm: 'row' }}
    >
      <HStack gap="4" flex="1" minW="0" align="center">
        <Flex
          boxSize="12"
          rounded="md"
          borderWidth="1px"
          borderColor="border"
          align="center"
          justify="center"
          color="fg"
          bg="bg.surface"
          flexShrink={0}
        >
          <OAuthProviderMark svg={OAUTH_PROVIDER_MARKS[provider]} label={providerLabel} />
        </Flex>
        <Stack gap="0.5" minW="0">
          <Text fontWeight="750" color="fg">
            {providerLabel}
          </Text>
          <Text textStyle="sm" color="fg.muted">
            {isConnected ? 'Connected to your Arkivra account.' : 'Not connected'}
          </Text>
        </Stack>
      </HStack>

      <HStack
        gap="3"
        w={{ base: '100%', sm: 'auto' }}
        justify={{ base: 'space-between', sm: 'flex-end' }}
        flexShrink={0}
      >
        {isConnected ? (
          <HStack color="teal.fg" gap="2" fontWeight="650">
            <Check size={16} strokeWidth={2} />
            <Text textStyle="sm">Connected</Text>
          </HStack>
        ) : null}
        {isConnected && canDisconnect ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            minW="8rem"
            loading={isDisconnecting}
            loadingText="Disconnecting..."
            onClick={onDisconnect}
          >
            Disconnect
          </Button>
        ) : null}
        {!isConnected ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            minW="7.5rem"
            disabled={!canConnect}
            onClick={onConnect}
          >
            Connect
            {isSelected ? <ChevronUp size={16} /> : <ChevronRight size={16} />}
          </Button>
        ) : null}
      </HStack>
    </Flex>
  );
}

function OAuthProviderMark({ label, svg }: { label: string; svg: string }) {
  return (
    <chakra.span
      aria-label={`${label} mark`}
      role="img"
      display="inline-block"
      boxSize="7"
      lineHeight="0"
      css={{
        '& svg': {
          display: 'block',
          height: '100%',
          width: '100%',
        },
      }}
      // eslint-disable-next-line react-dom/no-dangerously-set-innerhtml -- Local provider mark SVG assets are rendered inline.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
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
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : `Could not connect ${providerLabel}.`,
      );
    } finally {
      setIsLinking(false);
    }
  }

  return (
    <Box bg="bg.subtle" px={{ base: '4', md: '5' }} py={{ base: '4', md: '5' }}>
      <chakra.form onSubmit={handleSubmit}>
        <Stack gap="4">
          <Flex align="flex-start" justify="space-between" gap="3">
            <Stack gap="1">
              <Text fontSize="md" fontWeight="750" color="fg">
                Connect {providerLabel}
              </Text>
              <Text textStyle="sm" color="fg.muted">
                Enter your current password before connecting this provider.
              </Text>
            </Stack>
            <IconButton
              type="button"
              size="xs"
              variant="ghost"
              aria-label={`Collapse ${providerLabel} connection form`}
              onClick={() => {
                onCancel();
                setErrorMessage(null);
                setPassword('');
              }}
            >
              <ChevronUp size={16} />
            </IconButton>
          </Flex>

          <Field maxW="md">
            <FieldLabel htmlFor={`security-link-${provider}-password`}>Current password</FieldLabel>
            <PasswordInput
              id={`security-link-${provider}-password`}
              autoComplete="current-password"
              required
              value={password}
              placeholder="Current password"
              onChange={(event) => setPassword(event.target.value)}
              {...securityInputStyleProps}
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
            <Button type="submit" size="sm" loading={isLinking} loadingText="Connecting...">
              Continue
            </Button>
          </HStack>
        </Stack>
      </chakra.form>
    </Box>
  );
}

function getPasswordRequirements(value: string) {
  return [
    { label: 'At least 12 characters', met: value.length >= 12 },
    { label: 'One uppercase letter', met: PASSWORD_UPPERCASE_REGEX.test(value) },
    { label: 'One lowercase letter', met: PASSWORD_LOWERCASE_REGEX.test(value) },
    { label: 'One number', met: PASSWORD_NUMBER_REGEX.test(value) },
    { label: 'One special character', met: PASSWORD_SPECIAL_REGEX.test(value) },
  ];
}

function PasswordRequirements({ value }: { value: string }) {
  const requirements = getPasswordRequirements(value);
  const metCount = requirements.filter((item) => item.met).length;

  return (
    <Stack gap="5">
      <Stack gap="2">
        <Text fontSize="sm" fontWeight="semibold" color="fg">
          Password requirements
        </Text>
        <Stack gap="2">
          {requirements.map((item) => (
            <HStack key={item.label} gap="2">
              <Flex
                boxSize="4"
                align="center"
                justify="center"
                rounded="full"
                color={item.met ? 'fg.success' : 'fg.subtle'}
              >
                {item.met ? (
                  <Check size={14} />
                ) : (
                  <Box boxSize="2.5" rounded="full" borderWidth="1px" borderColor="currentColor" />
                )}
              </Flex>
              <Text textStyle="sm" color={item.met ? 'fg.muted' : 'fg.subtle'}>
                {item.label}
              </Text>
            </HStack>
          ))}
        </Stack>
      </Stack>

      <Stack gap="2">
        <Text fontSize="sm" fontWeight="semibold" color="fg">
          Password strength
        </Text>
        <PasswordStrengthMeter align="flex-start" value={Math.min(4, metCount)} />
      </Stack>
    </Stack>
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
    } catch (error) {
      setChangePasswordError(error instanceof Error ? error.message : 'Could not change password.');
    } finally {
      setIsChangingPassword(false);
    }
  }

  return (
    <chakra.form onSubmit={handleChangePasswordSubmit}>
      <Grid
        templateColumns={{ base: '1fr', lg: 'minmax(0, 1fr) 19rem' }}
        gap={{ base: '5', lg: '7' }}
      >
        <Stack gap="3">
          <Stack gap="0.5">
            <Text fontSize="sm" fontWeight="medium" color="fg">
              Update password
            </Text>
            <Text textStyle="sm" color="fg.muted">
              Enter your current password and choose a new one.
            </Text>
          </Stack>

          <Field>
            <FieldLabel htmlFor="security-current-password">Current password</FieldLabel>
            <PasswordInput
              id="security-current-password"
              autoComplete="current-password"
              required
              value={currentPassword}
              placeholder="Current password"
              onChange={(event) => setCurrentPassword(event.target.value)}
              {...securityInputStyleProps}
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="security-change-new-password">New password</FieldLabel>
            <PasswordInput
              id="security-change-new-password"
              autoComplete="new-password"
              required
              minLength={8}
              value={changedPassword}
              placeholder="Create a strong password"
              onChange={(event) => setChangedPassword(event.target.value)}
              {...securityInputStyleProps}
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="security-change-confirm-password">Confirm password</FieldLabel>
            <PasswordInput
              id="security-change-confirm-password"
              autoComplete="new-password"
              required
              minLength={8}
              value={confirmChangedPassword}
              placeholder="Repeat the new password"
              onChange={(event) => setConfirmChangedPassword(event.target.value)}
              {...securityInputStyleProps}
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
        <Box
          borderLeftWidth={{ base: '0', lg: '1px' }}
          borderColor="border.muted"
          pl={{ base: '0', lg: '6' }}
          pt={{ base: '1', lg: '0' }}
        >
          <PasswordRequirements value={changedPassword} />
        </Box>
      </Grid>
    </chakra.form>
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
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.status === 403 &&
        verificationMethod.type === 'oauth'
      ) {
        setNeedsSetPasswordOAuthVerification(true);
      }

      setSetPasswordError(error instanceof Error ? error.message : 'Could not set password.');
    } finally {
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
    <chakra.form onSubmit={handleSetPasswordSubmit}>
      <Grid
        templateColumns={{ base: '1fr', lg: 'minmax(0, 1fr) 19rem' }}
        gap={{ base: '5', lg: '7' }}
      >
        <Stack gap="3">
          <Stack gap="0.5">
            <Text fontSize="sm" fontWeight="medium" color="fg">
              Set password
            </Text>
            <Text textStyle="sm" color="fg.muted">
              Add password sign-in to this OAuth account. You can keep using your linked provider
              after setting a password.
            </Text>
          </Stack>

          <Field>
            <FieldLabel htmlFor="security-new-password">New password</FieldLabel>
            <PasswordInput
              id="security-new-password"
              autoComplete="new-password"
              required
              minLength={8}
              value={newPassword}
              placeholder="Create a strong password"
              onChange={(event) => setNewPassword(event.target.value)}
              {...securityInputStyleProps}
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="security-confirm-password">Confirm password</FieldLabel>
            <PasswordInput
              id="security-confirm-password"
              autoComplete="new-password"
              required
              minLength={8}
              value={confirmPassword}
              placeholder="Repeat the new password"
              onChange={(event) => setConfirmPassword(event.target.value)}
              {...securityInputStyleProps}
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
        <Box
          borderLeftWidth={{ base: '0', lg: '1px' }}
          borderColor="border.muted"
          pl={{ base: '0', lg: '6' }}
          pt={{ base: '1', lg: '0' }}
        >
          <PasswordRequirements value={newPassword} />
        </Box>
      </Grid>
    </chakra.form>
  );
}

export function SecuritySettingsPage() {
  const { data: sessionData, isPending: sessionPending } = authClient.useSession();
  const meQuery = useMeQuery();
  const isEmailVerified = sessionData?.user.emailVerified === true;
  const sessionTwoFactorEnabled = sessionData?.user.twoFactorEnabled === true;
  const [twoFactorOverride, setTwoFactorOverride] = useState<boolean | null>(null);
  const isTwoFactorEnabled = twoFactorOverride ?? sessionTwoFactorEnabled;
  const hasPassword = meQuery.data?.authMethods?.hasPassword !== false;
  const oauthProviders = meQuery.data?.authMethods?.oauthProviders ?? [];
  const verificationMethod = getSensitiveActionVerificationMethod(meQuery.data?.authMethods);
  const canChangeEmail = verificationMethod.type === 'password';
  const currentEmail = sessionData?.user.email ?? '';

  if (sessionPending) {
    return <Text textStyle="sm">Loading security settings...</Text>;
  }

  return (
    <SettingsPageFrame
      title="Security"
      description="Manage how you sign in and protect your Arkivra account."
      density="compact"
    >
      <Box w="full">
        <SettingsFlatRows variant="cards">
          <TwoFactorSettingsRow
            isTwoFactorEnabled={isTwoFactorEnabled}
            verificationMethod={verificationMethod}
            onSecurityChanged={setTwoFactorOverride}
          />

          <EmailAddressSettingsRow
            canChangeEmail={canChangeEmail}
            currentEmail={currentEmail}
            isEmailVerified={isEmailVerified}
            verificationMethod={verificationMethod}
          />

          <PasswordSettingsRow
            hasPassword={hasPassword}
            onPasswordEnabled={() => {
              void meQuery.refetch();
            }}
            verificationMethod={verificationMethod}
          />

          <ConnectedSignInSettingsRow hasPassword={hasPassword} oauthProviders={oauthProviders} />

          <SettingsSessionsSection rowVariant="card" />
        </SettingsFlatRows>
      </Box>
    </SettingsPageFrame>
  );
}
