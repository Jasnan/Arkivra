import type { FormEvent, ReactNode } from 'react';
import type { OAuthProviderId, SensitiveActionVerificationMethod } from '@/features/security/sensitive-action-verification.types';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Clipboard,
  Flex,
  Grid,
  HStack,
  IconButton,
  Input as ChakraInput,
  InputGroup,
  PinInput,
  QrCode,
  Stack,
  Text,
  VStack,
  chakra,
} from '@chakra-ui/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Check,
  ChevronRight,
  ChevronUp,
  ClipboardCopy,
  Info,
  KeyRound,
  Link2,
  LockKeyhole,
  Mail,
  ShieldCheck,
  ShieldOff,
} from 'lucide-react';
import { toast } from 'sonner';
import githubBrandSvg from '@/assets/brand-github.svg?raw';
import googleBrandSvg from '@/assets/brand-google.svg?raw';
import { ROUTES } from '@/app/routes';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { PasswordInput, PasswordStrengthMeter } from '@/components/ui/password-input';
import { meQueryKeys, useMeQuery } from '@/features/me/me.queries';
import { SensitiveActionVerificationStep } from '@/features/security/sensitive-action-verification';
import {
  OAUTH_PROVIDERS,
  PENDING_SENSITIVE_ACTION_KEY,
  TWO_FACTOR_DISABLE_ACTION,
  TWO_FACTOR_REGENERATE_CODES_ACTION,
  TWO_FACTOR_REPLACE_AUTHENTICATOR_ACTION,
  TWO_FACTOR_SETUP_ACTION,
  SET_PASSWORD_ACTION,
  changeAccountPassword,
  disableTwoFactor,
  getSensitiveActionVerificationMethod,
  linkOAuthAccount,
  regenerateTwoFactorBackupCodes,
  requestEmailChange,
  setAccountPassword,
  startTwoFactorSensitiveSetup,
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

const securityActionButtonMinWidth = '9.5rem';
const TOTP_SECRET_REGEX = /secret=([^&]+)/;
const NON_DIGIT_REGEX = /\D/g;
const PASSWORD_UPPERCASE_REGEX = /[A-Z]/;
const PASSWORD_LOWERCASE_REGEX = /[a-z]/;
const PASSWORD_NUMBER_REGEX = /\d/;
const PASSWORD_SPECIAL_REGEX = /[^A-Z0-9]/i;
const TWO_FACTOR_SETUP_STEPS = [
  { number: 1, title: 'Verify identity' },
  { number: 2, title: 'Scan QR code' },
  { number: 3, title: 'Confirm code' },
  { number: 4, title: 'Backup codes' },
] as const;
const OAUTH_PROVIDER_MARKS: Record<OAuthProviderId, string> = {
  github: githubBrandSvg,
  google: googleBrandSvg,
};
type TwoFactorSetupStep = 'identity' | 'scan' | 'confirm' | 'codes' | 'success';
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

function getTotpSecret(totpUri: string | null) {
  if (!totpUri) return null;

  const match = TOTP_SECRET_REGEX.exec(totpUri);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function getPinInputValue(value: string) {
  return Array.from({ length: 6 }, (_, index) => value[index] ?? '');
}

async function copyText(value: string, successMessage: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(successMessage);
  }
  catch {
    toast.error('Could not copy to clipboard.');
  }
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
    <Box
      mt="4"
      minW="0"
    >
      {children}
    </Box>
  );
}

function TwoFactorSettingsRow({
  isTwoFactorEnabled,
  onSecurityChanged,
  verificationMethod,
}: {
  isTwoFactorEnabled: boolean;
  onSecurityChanged: (isEnabled: boolean) => void;
  verificationMethod: SensitiveActionVerificationMethod;
}) {
  const queryClient = useQueryClient();
  const pendingActionHandledRef = useRef(false);
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<'setup' | 'manage'>(isTwoFactorEnabled ? 'manage' : 'setup');
  const [password, setPassword] = useState('');
  const [totpUri, setTotpUri] = useState<string | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [verificationCode, setVerificationCode] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [setupStep, setSetupStep] = useState<TwoFactorSetupStep>('identity');
  const [actionError, setActionError] = useState<string | null>(null);
  const [manageAction, setManageAction] = useState<'overview' | 'regenerate' | 'disable' | 'codes'>('overview');
  const secret = getTotpSecret(totpUri);
  const backupCodesText = backupCodes.join('\n');
  const displayedError = actionError;

  const startSetupMutation = useMutation({
    mutationFn: startTwoFactorSensitiveSetup,
    onSuccess: (data) => {
      if (!data.totpURI) {
        setActionError('Could not generate a 2FA setup key.');
        return;
      }

      setTotpUri(data.totpURI);
      setBackupCodes(data.backupCodes ?? []);
      setPassword('');
      setActionError(null);
      setIsOpen(true);
      setMode('setup');
      setSetupStep('scan');
      sessionStorage.removeItem(PENDING_SENSITIVE_ACTION_KEY);
    },
    onError: (error) => {
      setActionError(error instanceof Error ? error.message : 'Could not prepare 2FA.');
    },
  });

  const regenerateMutation = useMutation({
    mutationFn: regenerateTwoFactorBackupCodes,
    onSuccess: async (data) => {
      setBackupCodes(data.backupCodes);
      setPassword('');
      setActionError(null);
      setManageAction('codes');
      await queryClient.invalidateQueries({ queryKey: meQueryKeys.all });
      toast.success('Backup codes regenerated.');
      sessionStorage.removeItem(PENDING_SENSITIVE_ACTION_KEY);
    },
    onError: (error) => {
      setActionError(error instanceof Error ? error.message : 'Could not regenerate backup codes.');
    },
  });

  const disableMutation = useMutation({
    mutationFn: disableTwoFactor,
    onSuccess: async () => {
      setPassword('');
      setActionError(null);
      setIsOpen(false);
      setMode('setup');
      setSetupStep('identity');
      setManageAction('overview');
      setTotpUri(null);
      setBackupCodes([]);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: meQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: ['session'] }),
      ]);
      onSecurityChanged(false);
      toast.success('Two-factor authentication disabled.');
      sessionStorage.removeItem(PENDING_SENSITIVE_ACTION_KEY);
    },
    onError: (error) => {
      setActionError(error instanceof Error ? error.message : 'Could not disable two-factor authentication.');
    },
  });

  const startSetup = useCallback((passwordValue?: string) => {
    setActionError(null);
    startSetupMutation.mutate({ password: passwordValue });
  }, [startSetupMutation]);

  useEffect(() => {
    if (verificationMethod.type !== 'oauth') return;
    if (pendingActionHandledRef.current) return;

    const pendingAction = sessionStorage.getItem(PENDING_SENSITIVE_ACTION_KEY);

    if (pendingAction === TWO_FACTOR_SETUP_ACTION || pendingAction === TWO_FACTOR_REPLACE_AUTHENTICATOR_ACTION) {
      pendingActionHandledRef.current = true;
      startSetup();
      return;
    }

    if (pendingAction === TWO_FACTOR_REGENERATE_CODES_ACTION) {
      pendingActionHandledRef.current = true;
      setIsOpen(true);
      setMode('manage');
      regenerateMutation.mutate({});
      return;
    }

    if (pendingAction === TWO_FACTOR_DISABLE_ACTION) {
      pendingActionHandledRef.current = true;
      setIsOpen(true);
      setMode('manage');
      disableMutation.mutate({});
    }
  }, [disableMutation, regenerateMutation, startSetup, verificationMethod.type]);

  function handleToggle() {
    setIsOpen((open) => !open);
    setMode(isTwoFactorEnabled ? 'manage' : 'setup');
    setSetupStep('identity');
    setActionError(null);
    setPassword('');
  }

  function handleSetupSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startSetup(password);
  }

  async function handleVerify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActionError(null);

    const normalizedCode = verificationCode.replace(NON_DIGIT_REGEX, '');
    if (normalizedCode.length !== 6) {
      setActionError('Enter the 6-digit code from your authenticator app.');
      return;
    }

    setIsVerifying(true);
    try {
      const { error } = await authClient.twoFactor.verifyTotp({ code: normalizedCode });
      if (error) {
        setActionError(error.message ?? 'Verification failed.');
        return;
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: meQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: ['session'] }),
      ]);
      onSecurityChanged(true);
      setSetupStep('codes');
    }
    finally {
      setIsVerifying(false);
    }
  }

  function resetManageAction() {
    setPassword('');
    setActionError(null);
    setManageAction('overview');
  }

  return (
    <SettingsFlatRow
      title="Two-factor authentication"
      description={isTwoFactorEnabled
        ? 'Your account requires an authenticator code at sign-in.'
        : 'Add a second sign-in step to keep your account and documents secure.'}
      icon={<ShieldCheck size={21} strokeWidth={1.8} />}
      variant="card"
      actions={(
        <HStack gap="4" flexWrap="wrap" justify={{ base: 'flex-start', md: 'flex-end' }}>
          <SettingsStatusBadge density="compact" tone={isTwoFactorEnabled ? 'enabled' : 'warning'}>
            {isTwoFactorEnabled ? 'Enabled' : 'Disabled'}
          </SettingsStatusBadge>
          <Button
            type="button"
            size="sm"
            minW={securityActionButtonMinWidth}
            onClick={handleToggle}
          >
            {isTwoFactorEnabled ? 'Manage 2FA' : 'Enable 2FA'}
            {isOpen ? <ChevronUp size={16} /> : <ChevronRight size={16} />}
          </Button>
        </HStack>
      )}
    >
      {isOpen ? (
        <InlineSecurityPanel>
          {mode === 'setup' && !totpUri ? (
            <TwoFactorSetupShell step="identity">
              <SensitiveActionVerificationStep
                actionLabel="Preparing 2FA"
                errorMessage={displayedError}
                isPending={startSetupMutation.isPending}
                method={verificationMethod}
                oauthCallbackURL={getSecurityCallbackURL()}
                oauthPendingAction={TWO_FACTOR_SETUP_ACTION}
                password={password}
                setPassword={setPassword}
                onCancel={() => setIsOpen(false)}
                onPasswordSubmit={handleSetupSubmit}
              />
            </TwoFactorSetupShell>
          ) : null}

          {mode === 'setup' && totpUri && setupStep !== 'codes' ? (
            <TwoFactorSetupPanel
              errorMessage={displayedError}
              isVerifying={isVerifying}
              secret={secret}
              step={setupStep}
              totpUri={totpUri}
              verificationCode={verificationCode}
              onCodeEntry={() => setSetupStep('confirm')}
              setVerificationCode={setVerificationCode}
              onCancel={() => setIsOpen(false)}
              onSubmit={handleVerify}
            />
          ) : null}

          {mode === 'setup' && setupStep === 'codes' ? (
            <TwoFactorSetupBackupCodesPanel
              backupCodes={backupCodes}
              backupCodesText={backupCodesText}
              onDone={() => {
                const toastId = toast.success('Two-factor authentication enabled.', {
                  action: {
                    label: 'Dismiss',
                    onClick: () => toast.dismiss(toastId),
                  },
                });
                setMode('manage');
                setManageAction('overview');
                setIsOpen(false);
                setTotpUri(null);
                setVerificationCode('');
              }}
            />
          ) : null}

          {mode === 'manage' ? (
            <TwoFactorManagePanel
              action={manageAction}
              backupCodes={backupCodes}
              backupCodesText={backupCodesText}
              errorMessage={displayedError}
              isDisabling={disableMutation.isPending}
              isRegenerating={regenerateMutation.isPending}
              password={password}
              setPassword={setPassword}
              verificationMethod={verificationMethod}
              onCancel={resetManageAction}
              onDisableSubmit={(event) => {
                event.preventDefault();
                disableMutation.mutate({ password });
              }}
              onRegenerateSubmit={(event) => {
                event.preventDefault();
                regenerateMutation.mutate({ password });
              }}
              onReconnect={() => {
                setMode('setup');
                setSetupStep('identity');
                setTotpUri(null);
                setBackupCodes([]);
                setVerificationCode('');
                setActionError(null);
                setPassword('');
              }}
              onSelectAction={setManageAction}
            />
          ) : null}
        </InlineSecurityPanel>
      ) : null}
    </SettingsFlatRow>
  );
}

function getTwoFactorSetupStepIndex(step: TwoFactorSetupStep) {
  if (step === 'identity') return 0;
  if (step === 'scan') return 1;
  if (step === 'confirm') return 2;
  return 3;
}

function getTwoFactorSetupStepStatus(index: number, currentStep: TwoFactorSetupStep) {
  const currentIndex = getTwoFactorSetupStepIndex(currentStep);

  if (currentStep === 'success' || index < currentIndex) return 'Completed';
  if (index === currentIndex) return 'In progress';
  return 'Pending';
}

function TwoFactorWorkflowStepper({ step }: { step: TwoFactorSetupStep }) {
  const currentIndex = Math.min(getTwoFactorSetupStepIndex(step), TWO_FACTOR_SETUP_STEPS.length - 1);

  return (
    <Box aria-label="Two-factor setup progress" role="list" w="100%" overflowX="auto" pb="1">
      <HStack minW={{ base: '52rem', lg: '0' }} align="flex-start" gap="0">
        {TWO_FACTOR_SETUP_STEPS.map(({ number, title }, index) => {
          const isCompleted = step === 'success' || index < currentIndex;
          const isCurrent = step !== 'success' && index === currentIndex;
          const circleBg = isCompleted ? 'teal.solid' : isCurrent ? 'teal.subtle' : 'bg.surface';
          const circleBorder = isCompleted || isCurrent ? 'teal.solid' : 'border.surface';
          const circleColor = isCompleted ? 'fg.inverted' : isCurrent ? 'teal.fg' : 'fg.muted';
          const lineColor = isCompleted ? 'teal.solid' : 'border.surface';
          const status = getTwoFactorSetupStepStatus(index, step);

          return (
            <HStack
              key={title}
              role="listitem"
              flex={index === TWO_FACTOR_SETUP_STEPS.length - 1 ? '0 0 auto' : '1 1 0'}
              align="flex-start"
              gap="3"
              minW="0"
            >
              <Flex
                boxSize={{ base: '6', md: '7' }}
                align="center"
                justify="center"
                rounded="full"
                borderWidth="2px"
                borderColor={circleBorder}
                bg={circleBg}
                color={circleColor}
                flexShrink={0}
                fontSize="xs"
                fontWeight="semibold"
              >
                {number}
              </Flex>
              <Box minW="0" pt="0.5">
                <Text
                  fontSize={{ base: 'sm', md: 'md' }}
                  fontWeight="semibold"
                  color={isCurrent || isCompleted ? 'fg' : 'fg.muted'}
                  lineHeight="1.2"
                >
                  {title}
                </Text>
                <Text
                  fontSize="sm"
                  color={isCompleted ? 'teal.fg' : isCurrent ? 'fg.muted' : 'fg.subtle'}
                >
                  {status}
                </Text>
              </Box>
              {index < TWO_FACTOR_SETUP_STEPS.length - 1 ? (
                <Box
                  h="1px"
                  flex="1"
                  minW="8"
                  bg={lineColor}
                  mt={{ base: '3', md: '3.5' }}
                  mx={{ base: '2', md: '4' }}
                />
              ) : null}
            </HStack>
          );
        })}
      </HStack>
    </Box>
  );
}

function TwoFactorSetupShell({
  children,
  step,
}: {
  children: ReactNode;
  step: TwoFactorSetupStep;
}) {
  return (
    <Box rounded="md" borderWidth="1px" borderColor="border.surface" p={{ base: '4', lg: '6' }}>
      <Stack gap="5">
        <TwoFactorWorkflowStepper step={step} />
        <Box borderTopWidth="1px" borderColor="border.muted" />
        {children}
      </Stack>
    </Box>
  );
}

function TwoFactorSetupPanel({
  errorMessage,
  isVerifying,
  onCodeEntry,
  secret,
  setVerificationCode,
  step,
  totpUri,
  verificationCode,
  onCancel,
  onSubmit,
}: {
  errorMessage: string | null;
  isVerifying: boolean;
  onCodeEntry: () => void;
  secret: string | null;
  step: TwoFactorSetupStep;
  totpUri: string;
  verificationCode: string;
  setVerificationCode: (value: string) => void;
  onCancel: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <TwoFactorSetupShell step={step}>
      <chakra.form onSubmit={onSubmit}>
        <Grid templateColumns={{ base: '1fr', lg: 'minmax(0, 1.1fr) minmax(18rem, 0.9fr)' }} gap={{ base: '5', lg: '8' }}>
          <Grid templateColumns={{ base: '1fr', md: 'auto auto minmax(0, 1fr)' }} alignItems="center" gap="5">
            <Box
              aria-label="Authenticator setup QR code"
              bg="white"
              borderWidth="1px"
              borderColor="border.surface"
              rounded="md"
              p="3"
              role="img"
              w="fit-content"
            >
              <QrCode.Root value={totpUri} size="md" encoding={{ ecc: 'M' }}>
                <QrCode.Frame style={{ fill: '#000000' }}>
                  <QrCode.Pattern />
                </QrCode.Frame>
              </QrCode.Root>
            </Box>

            <Text textStyle="sm" color="fg.muted" textAlign="center">
              OR
            </Text>

            <Stack gap="3" minW="0">
              <Stack gap="1">
                <Text fontSize="sm" fontWeight="semibold" color="fg">
                  Can't scan?
                </Text>
                <Text textStyle="sm" color="fg.muted">
                  Enter this code manually in your authenticator app.
                </Text>
              </Stack>
              <Clipboard.Root maxW="sm" value={secret ?? ''}>
                <InputGroup endElement={<ManualSetupKeyCopyButton />}>
                  <Clipboard.Input asChild>
                    <ChakraInput
                      aria-label="Manual setup key"
                      readOnly
                      value={secret ?? ''}
                      fontFamily="mono"
                      h="var(--arkivra-controlHeight, 2.5rem)"
                      minH="var(--arkivra-controlHeight, 2.5rem)"
                      px="var(--arkivra-controlPaddingX, 0.75rem)"
                      {...securityInputStyleProps}
                    />
                  </Clipboard.Input>
                </InputGroup>
              </Clipboard.Root>
            </Stack>
          </Grid>

          <VStack align="stretch" gap="4" borderLeftWidth={{ base: '0', lg: '1px' }} borderColor="border.muted" pl={{ base: '0', lg: '6' }}>
            <Field>
              <FieldLabel htmlFor="security-two-factor-code">Enter 6-digit code</FieldLabel>
              <PinInput.Root
                count={6}
                ids={{ hiddenInput: 'security-two-factor-code' }}
                invalid={Boolean(errorMessage)}
                otp
                type="numeric"
                value={getPinInputValue(verificationCode)}
                onValueChange={(details) => {
                  onCodeEntry();
                  setVerificationCode(details.value.join('').replace(NON_DIGIT_REGEX, '').slice(0, 6));
                }}
                onValueComplete={(details) => {
                  onCodeEntry();
                  setVerificationCode(details.value.join('').replace(NON_DIGIT_REGEX, '').slice(0, 6));
                }}
              >
                <PinInput.HiddenInput />
                <PinInput.Control gap="2" flexWrap="wrap">
                  {Array.from({ length: 6 }, (_, index) => (
                    <PinInput.Input
                      key={index}
                      index={index}
                      bg="bg.surface"
                      borderColor="border"
                      color="fg"
                      fontWeight="semibold"
                      _hover={securityInputStyleProps._hover}
                    />
                  ))}
                </PinInput.Control>
              </PinInput.Root>
            </Field>
            {errorMessage ? <FieldError>{errorMessage}</FieldError> : null}

            <HStack justify="flex-end" gap="2.5" mt="auto">
              <Button type="button" size="sm" variant="outline" onClick={onCancel}>
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                loading={isVerifying}
                disabled={verificationCode.length !== 6}
                minW="12rem"
              >
                Verify and continue
              </Button>
            </HStack>
          </VStack>
        </Grid>
      </chakra.form>
    </TwoFactorSetupShell>
  );
}

function ManualSetupKeyCopyButton() {
  return (
    <Clipboard.Trigger asChild>
      <IconButton
        aria-label="Copy setup key"
        variant="ghost"
        size="xs"
        me="-2"
      >
        <Clipboard.Indicator />
      </IconButton>
    </Clipboard.Trigger>
  );
}

function TwoFactorSetupBackupCodesPanel({
  backupCodes,
  backupCodesText,
  onDone,
}: {
  backupCodes: string[];
  backupCodesText: string;
  onDone: () => void;
}) {
  return (
    <TwoFactorSetupShell step="codes">
      <Stack gap="5">
        <Stack gap="1">
          <Text fontSize="md" fontWeight="semibold" color="fg">
            Save your backup codes
          </Text>
          <Text textStyle="sm" color="fg.muted">
            Store these codes now. You will not be able to view them again after leaving this page, and each code can only be used once.
          </Text>
        </Stack>

        <Grid
          borderWidth="1px"
          borderColor="border.surface"
          rounded="md"
          overflow="hidden"
          templateColumns={{ base: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }}
        >
          {backupCodes.map((code, index) => (
            <HStack
              key={code}
              justify="space-between"
              gap="3"
              px="4"
              py="3"
              borderBottomWidth={index < backupCodes.length - 1 ? '1px' : undefined}
              borderRightWidth={{ base: undefined, sm: index % 2 === 0 ? '1px' : undefined }}
              borderColor="border.surface"
            >
              <Text fontFamily="mono" fontSize="sm" fontWeight="semibold">
                {code}
              </Text>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label={`Copy backup code ${index + 1}`}
                onClick={() => copyText(code, 'Backup code copied.')}
              >
                <ClipboardCopy size={15} />
              </Button>
            </HStack>
          ))}
        </Grid>

        <HStack justify="space-between" gap="3" flexWrap="wrap">
          <Button type="button" size="sm" variant="outline" onClick={() => copyText(backupCodesText, 'Backup codes copied.')}>
            <ClipboardCopy size={15} />
            Copy all
          </Button>
          <Button type="button" size="sm" onClick={onDone}>
            Done
          </Button>
        </HStack>
      </Stack>
    </TwoFactorSetupShell>
  );
}

function TwoFactorManagePanel({
  action,
  backupCodes,
  backupCodesText,
  errorMessage,
  isDisabling,
  isRegenerating,
  password,
  setPassword,
  verificationMethod,
  onCancel,
  onDisableSubmit,
  onReconnect,
  onRegenerateSubmit,
  onSelectAction,
}: {
  action: 'overview' | 'regenerate' | 'disable' | 'codes';
  backupCodes: string[];
  backupCodesText: string;
  errorMessage: string | null;
  isDisabling: boolean;
  isRegenerating: boolean;
  password: string;
  setPassword: (value: string) => void;
  verificationMethod: SensitiveActionVerificationMethod;
  onCancel: () => void;
  onDisableSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onReconnect: () => void;
  onRegenerateSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onSelectAction: (action: 'overview' | 'regenerate' | 'disable' | 'codes') => void;
}) {
  if (action === 'regenerate') {
    return (
      <SensitiveActionVerificationStep
        actionLabel="Regenerating codes"
        errorMessage={errorMessage}
        isPending={isRegenerating}
        method={verificationMethod}
        oauthCallbackURL={getSecurityCallbackURL()}
        oauthPendingAction={TWO_FACTOR_REGENERATE_CODES_ACTION}
        password={password}
        setPassword={setPassword}
        onCancel={onCancel}
        onPasswordSubmit={onRegenerateSubmit}
      />
    );
  }

  if (action === 'disable') {
    return (
      <SensitiveActionVerificationStep
        actionLabel="Disabling 2FA"
        errorMessage={errorMessage}
        isPending={isDisabling}
        method={verificationMethod}
        oauthCallbackURL={getSecurityCallbackURL()}
        oauthPendingAction={TWO_FACTOR_DISABLE_ACTION}
        password={password}
        setPassword={setPassword}
        onCancel={onCancel}
        onPasswordSubmit={onDisableSubmit}
      />
    );
  }

  if (action === 'codes') {
    return (
      <Box rounded="md" borderWidth="1px" borderColor="border.surface" p="4">
        <Stack gap="4">
          <Stack gap="1">
            <Text fontWeight="semibold" color="fg">
              New backup codes
            </Text>
            <Text textStyle="sm" color="fg.muted">
              Store these codes now. They cannot be viewed again after leaving this page.
            </Text>
          </Stack>
          <Grid templateColumns={{ base: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }} gap="2">
            {backupCodes.map(code => (
              <Text key={code} rounded="md" bg="bg.subtle" px="3" py="2" fontFamily="mono" fontSize="sm" fontWeight="semibold">
                {code}
              </Text>
            ))}
          </Grid>
          <HStack justify="space-between" gap="3" flexWrap="wrap">
            <Button type="button" size="sm" variant="outline" onClick={() => copyText(backupCodesText, 'Backup codes copied.')}>
              <ClipboardCopy size={15} />
              Copy all
            </Button>
            <Button type="button" size="sm" onClick={onCancel}>
              Done
            </Button>
          </HStack>
        </Stack>
      </Box>
    );
  }

  return (
    <Grid templateColumns={{ base: '1fr', lg: 'repeat(3, minmax(0, 1fr))' }} gap="3">
      <TwoFactorManageAction
        icon={<ShieldCheck size={18} />}
        title="Authenticator app"
        description="Replace the authenticator app connected to this account."
        actionLabel="Replace authenticator"
        onClick={onReconnect}
      />
      <TwoFactorManageAction
        icon={<KeyRound size={18} />}
        title="Backup codes"
        description="Generate a new set if your existing backup codes are lost."
        actionLabel="Generate new codes"
        onClick={() => onSelectAction('regenerate')}
      />
      <TwoFactorManageAction
        danger
        icon={<ShieldOff size={18} />}
        title="Disable 2FA"
        description="Remove authenticator protection from this account."
        actionLabel="Disable 2FA"
        onClick={() => onSelectAction('disable')}
      />
    </Grid>
  );
}

function TwoFactorManageAction({
  actionLabel,
  danger = false,
  description,
  icon,
  onClick,
  title,
}: {
  actionLabel: string;
  danger?: boolean;
  description: string;
  icon: ReactNode;
  onClick: () => void;
  title: string;
}) {
  return (
    <Box rounded="md" borderWidth="1px" borderColor={danger ? 'border.error' : 'border.surface'} p="4">
      <Stack gap="5" h="full">
        <Stack gap="2">
          <HStack align="center" gap="2.5">
            <Flex boxSize="5" align="center" justify="center" color={danger ? 'fg.error' : 'fg.muted'} flexShrink={0}>
              {icon}
            </Flex>
            <Text fontSize="sm" fontWeight="semibold" color={danger ? 'fg.error' : 'fg'}>
              {title}
            </Text>
          </HStack>
          <Text textStyle="sm" color="fg.muted">
            {description}
          </Text>
        </Stack>
        <Button type="button" size="sm" variant="outline" colorPalette={danger ? 'red' : undefined} w="full" onClick={onClick}>
          {actionLabel}
        </Button>
      </Stack>
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
      description={hasPassword
        ? 'Use a password to sign in to your Arkivra account.'
        : 'This account currently uses linked OAuth sign-in. You can set a password to sign in directly.'}
      icon={<LockKeyhole size={21} strokeWidth={1.8} />}
      variant="card"
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
      )}
    >
      {hasPassword && isChangePasswordOpen ? (
        <InlineSecurityPanel>
          <ChangePasswordForm
            onCancel={() => setIsChangePasswordOpen(false)}
          />
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
  const connectedOAuthProviders = linkableProviders.filter(provider => connectedProviders.has(provider));
  const isConnectionsOpen = isManageConnectionsOpen || selectedProvider !== null;
  const disconnectMutation = useMutation({
    mutationFn: unlinkOAuthAccount,
    onSuccess: async (_result, { provider }) => {
      setSelectedProvider(null);
      toast.success(`${OAUTH_PROVIDERS[provider].label} is disconnected.`);
      await queryClient.invalidateQueries({ queryKey: meQueryKeys.all });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not disconnect sign-in provider.');
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
      actions={(
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
      )}
    >
      {isConnectionsOpen ? (
        <InlineSecurityPanel>
          <Stack gap="4">
            <Box rounded="md" borderWidth="1px" borderColor="border" bg="bg.surface" overflow="hidden">
              <Stack gap="0" divideY="1px" divideColor="border.surface">
                {linkableProviders.map((provider) => {
                  const isConnected = connectedProviders.has(provider);
                  const canDisconnect = isConnected && (hasPassword || connectedOAuthProviders.some(other => other !== provider));
                  const isSelected = selectedProvider === provider;

                  return (
                    <Fragment key={provider}>
                      <ConnectedSignInProviderRow
                        provider={provider}
                        isConnected={isConnected}
                        isSelected={isSelected}
                        canConnect={hasPassword}
                        canDisconnect={canDisconnect}
                        isDisconnecting={disconnectMutation.isPending && disconnectMutation.variables?.provider === provider}
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
    }
    catch (error) {
      setErrorMessage(error instanceof Error ? error.message : `Could not connect ${providerLabel}.`);
    }
    finally {
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
  const metCount = requirements.filter(item => item.met).length;

  return (
    <Stack gap="5">
      <Stack gap="2">
        <Text fontSize="sm" fontWeight="semibold" color="fg">
          Password requirements
        </Text>
        <Stack gap="2">
          {requirements.map(item => (
            <HStack key={item.label} gap="2">
              <Flex boxSize="4" align="center" justify="center" rounded="full" color={item.met ? 'fg.success' : 'fg.subtle'}>
                {item.met ? <Check size={14} /> : <Box boxSize="2.5" rounded="full" borderWidth="1px" borderColor="currentColor" />}
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
    }
    catch (error) {
      setChangePasswordError(error instanceof Error ? error.message : 'Could not change password.');
    }
    finally {
      setIsChangingPassword(false);
    }
  }

  return (
    <chakra.form onSubmit={handleChangePasswordSubmit}>
      <Grid templateColumns={{ base: '1fr', lg: 'minmax(0, 1fr) 19rem' }} gap={{ base: '5', lg: '7' }}>
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
        <Box borderLeftWidth={{ base: '0', lg: '1px' }} borderColor="border.muted" pl={{ base: '0', lg: '6' }} pt={{ base: '1', lg: '0' }}>
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
    <chakra.form onSubmit={handleSetPasswordSubmit}>
      <Grid templateColumns={{ base: '1fr', lg: 'minmax(0, 1fr) 19rem' }} gap={{ base: '5', lg: '7' }}>
        <Stack gap="3">
          <Stack gap="0.5">
            <Text fontSize="sm" fontWeight="medium" color="fg">
              Set password
            </Text>
            <Text textStyle="sm" color="fg.muted">
              Add password sign-in to this OAuth account. You can keep using your linked provider after setting a password.
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
        <Box borderLeftWidth={{ base: '0', lg: '1px' }} borderColor="border.muted" pl={{ base: '0', lg: '6' }} pt={{ base: '1', lg: '0' }}>
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
  const [isEmailChangeOpen, setIsEmailChangeOpen] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailChangeError, setEmailChangeError] = useState<string | null>(null);
  const currentEmail = sessionData?.user.email ?? '';

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
        <SettingsFlatRows variant="cards">
          <TwoFactorSettingsRow
            isTwoFactorEnabled={isTwoFactorEnabled}
            verificationMethod={verificationMethod}
            onSecurityChanged={setTwoFactorOverride}
          />

          <SettingsFlatRow
            title="Email address"
            description={(
              <Stack gap="0.5">
                <Text as="span" color="fg">
                  {currentEmail || 'No email address available.'}
                </Text>
                <Text as="span" color="fg.muted">
                  Used for sign-in, notifications, and security alerts.
                </Text>
              </Stack>
            )}
            icon={<Mail size={21} strokeWidth={1.8} />}
            variant="card"
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
                  {isEmailChangeOpen ? <ChevronUp size={16} /> : <ChevronRight size={16} />}
                </Button>
              </HStack>
            )}
          >
          {isEmailChangeOpen ? (
            <InlineSecurityPanel>
              <chakra.form onSubmit={handleEmailChangeSubmit}>
                <Grid templateColumns={{ base: '1fr', lg: 'minmax(0, 1fr) 22rem' }} gap={{ base: '5', lg: '7' }}>
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
                        <FieldLabel htmlFor="security-email-change-password">Current password</FieldLabel>
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

                  <Box borderLeftWidth={{ base: '0', lg: '1px' }} borderColor="border.muted" pl={{ base: '0', lg: '6' }}>
                    <HStack align="flex-start" gap="3" rounded="md" borderWidth="1px" borderColor="blue.muted" bg="blue.subtle" p="4">
                      <Box color="blue.fg" flexShrink={0} mt="0.5">
                        <Info size={18} />
                      </Box>
                      <Stack gap="1">
                        <Text fontSize="sm" fontWeight="semibold" color="fg">
                          What happens next?
                        </Text>
                        <Text textStyle="sm" color="fg.muted">
                          We'll send a confirmation link to your current email address. Your new email will be active once you confirm.
                        </Text>
                      </Stack>
                    </HStack>
                  </Box>
                </Grid>
              </chakra.form>
            </InlineSecurityPanel>
          ) : null}
          </SettingsFlatRow>

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

          <SettingsSessionsSection rowVariant="card" />
        </SettingsFlatRows>
      </Box>
    </SettingsPageFrame>
  );
}
