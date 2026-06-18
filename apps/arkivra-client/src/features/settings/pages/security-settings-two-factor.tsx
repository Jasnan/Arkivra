import type { FormEvent, ReactNode } from 'react';
import type { SensitiveActionVerificationMethod } from '@/features/security/sensitive-action-verification.types';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Box, HStack } from '@chakra-ui/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, ChevronUp, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toaster-store';
import { meQueryKeys } from '@/features/me/me.queries';
import { SensitiveActionVerificationStep } from '@/features/security/sensitive-action-verification';
import {
  PENDING_SENSITIVE_ACTION_KEY,
  TWO_FACTOR_DISABLE_ACTION,
  TWO_FACTOR_REGENERATE_CODES_ACTION,
  TWO_FACTOR_REPLACE_AUTHENTICATOR_ACTION,
  TWO_FACTOR_SETUP_ACTION,
  disableTwoFactor,
  regenerateTwoFactorBackupCodes,
  startTwoFactorSensitiveSetup,
} from '@/features/security/sensitive-action-verification.types';
import { authClient } from '@/lib/auth-client';
import { SettingsFlatRow, SettingsStatusBadge } from '../components/settings-ui';
import {
  TwoFactorManagePanel,
  TwoFactorSetupBackupCodesPanel,
  TwoFactorSetupPanel,
  TwoFactorSetupShell,
  getSecurityCallbackURL,
} from './security-settings-two-factor-panels';
import type { TwoFactorSetupStep } from './security-settings-two-factor-panels';

const securityActionButtonMinWidth = '9.5rem';
const TOTP_SECRET_REGEX = /secret=([^&]+)/;
const NON_DIGIT_REGEX = /\D/g;

function getTotpSecret(totpUri: string | null) {
  if (!totpUri) return null;

  const match = TOTP_SECRET_REGEX.exec(totpUri);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function InlineSecurityPanel({ children }: { children: ReactNode }) {
  return (
    <Box mt="4" minW="0">
      {children}
    </Box>
  );
}

export function TwoFactorSettingsRow({
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
  const [manageAction, setManageAction] = useState<'overview' | 'regenerate' | 'disable' | 'codes'>(
    'overview',
  );
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
      setActionError(
        error instanceof Error ? error.message : 'Could not disable two-factor authentication.',
      );
    },
  });

  const startSetup = useCallback(
    (passwordValue?: string) => {
      setActionError(null);
      startSetupMutation.mutate({ password: passwordValue });
    },
    [startSetupMutation],
  );

  useEffect(() => {
    if (verificationMethod.type !== 'oauth') return;
    if (pendingActionHandledRef.current) return;

    const pendingAction = sessionStorage.getItem(PENDING_SENSITIVE_ACTION_KEY);

    if (
      pendingAction === TWO_FACTOR_SETUP_ACTION ||
      pendingAction === TWO_FACTOR_REPLACE_AUTHENTICATOR_ACTION
    ) {
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
    } finally {
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
      description={
        isTwoFactorEnabled
          ? 'Your account requires an authenticator code at sign-in.'
          : 'Add a second sign-in step to keep your account and documents secure.'
      }
      icon={<ShieldCheck size={21} strokeWidth={1.8} />}
      variant="card"
      actions={
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
      }
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
