import type { FormEvent, ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Flex, Grid, HStack, Stack, Text, VStack } from '@chakra-ui/react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowLeft,
  ClipboardCopy,
  Download,
  KeyRound,
  LockKeyhole,
  RotateCw,
  ShieldCheck,
  ShieldOff,
  Smartphone,
} from 'lucide-react';
import { toast } from 'sonner';
import { ROUTES } from '@/app/routes';
import { PageIntro, SurfacePanel } from '@/components/layout/vault-ui';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { authClient } from '@/lib/auth-client';
import { formatShortDate, formatShortDateTime } from '@/lib/localization';
import { meQueryKeys, useMeQuery } from '@/features/me/me.queries';
import { SensitiveActionVerificationStep } from '@/features/security/sensitive-action-verification';
import {
  PENDING_SENSITIVE_ACTION_KEY,
  TWO_FACTOR_DISABLE_ACTION,
  TWO_FACTOR_REGENERATE_CODES_ACTION,
  disableTwoFactor,
  getSensitiveActionVerificationMethod,
  regenerateTwoFactorBackupCodes,
} from '@/features/security/sensitive-action-verification.types';

type ManagementAction = 'overview' | 'regenerate' | 'disable' | 'codes';

function formatDate(value: string | null | undefined) {
  if (!value) return null;
  return formatShortDate(value);
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return null;
  return formatShortDateTime(value);
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

function downloadBackupCodes(codes: string[]) {
  if (codes.length === 0) return;

  try {
    const blob = new Blob([`${codes.join('\n')}\n`], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'arkivra-backup-codes.txt';
    link.click();
    URL.revokeObjectURL(url);
    toast.success('Backup codes downloaded.');
  }
  catch {
    toast.error('Could not download backup codes.');
  }
}

function getManagementCallbackURL() {
  return new URL(ROUTES.twoFactorManage, window.location.origin).toString();
}

function getReplaceAuthenticatorURL() {
  return `${ROUTES.twoFactorSetup}?mode=replace`;
}

function getPendingManagementAction() {
  const pendingAction = sessionStorage.getItem(PENDING_SENSITIVE_ACTION_KEY);

  return pendingAction === TWO_FACTOR_REGENERATE_CODES_ACTION || pendingAction === TWO_FACTOR_DISABLE_ACTION
    ? pendingAction
    : null;
}

function SectionPanel({
  children,
  danger = false,
}: {
  children: ReactNode;
  danger?: boolean;
}) {
  return (
    <SurfacePanel
      borderColor={danger ? 'border.error' : 'border.surface'}
      bg={danger ? 'red.subtle' : 'bg.surface'}
      overflow="hidden"
      p="0"
    >
      {children}
    </SurfacePanel>
  );
}

function SectionRow({
  actions,
  description,
  icon,
  title,
}: {
  actions?: ReactNode;
  description: ReactNode;
  icon: ReactNode;
  title: string;
}) {
  return (
    <Grid
      gap="4"
      p={{ base: '4', md: '5' }}
      templateColumns={{ base: '1fr', md: 'minmax(0, 1fr) auto' }}
      alignItems="center"
    >
      <HStack align="flex-start" gap="4" minW="0">
        <Flex
          boxSize="11"
          align="center"
          justify="center"
          rounded="md"
          bg="teal.subtle"
          color="teal.fg"
          flexShrink="0"
        >
          {icon}
        </Flex>
        <Stack gap="1" minW="0">
          <Text fontWeight="semibold" color="fg">
            {title}
          </Text>
          <Text fontSize="sm" color="fg.muted">
            {description}
          </Text>
        </Stack>
      </HStack>

      {actions ? (
        <Stack gap="2" align={{ base: 'stretch', md: 'flex-end' }}>
          {actions}
        </Stack>
      ) : null}
    </Grid>
  );
}

export function TwoFactorManagementPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: sessionData, isPending: sessionPending } = authClient.useSession();
  const meQuery = useMeQuery();
  const pendingManagementActionRef = useRef<string | null>(getPendingManagementAction());
  const pendingActionHandledRef = useRef(false);
  const [action, setAction] = useState<ManagementAction>(() => {
    if (pendingManagementActionRef.current === TWO_FACTOR_REGENERATE_CODES_ACTION) return 'regenerate';
    if (pendingManagementActionRef.current === TWO_FACTOR_DISABLE_ACTION) return 'disable';
    return 'overview';
  });
  const [password, setPassword] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [generatedCodes, setGeneratedCodes] = useState<string[]>([]);

  const verificationMethod = getSensitiveActionVerificationMethod(meQuery.data?.authMethods);
  const displayedError = actionError ?? (meQuery.isError ? 'Could not load your sign-in methods.' : null);
  const twoFactor = meQuery.data?.twoFactor;
  const backupCodeCount = twoFactor?.backupCodeCount ?? null;
  const authenticatorLinkedAt = formatDateTime(twoFactor?.authenticatorLinkedAt);
  const backupCodesUpdatedAt = formatDate(twoFactor?.backupCodesUpdatedAt);
  const isTwoFactorEnabled = sessionData?.user.twoFactorEnabled === true;

  const generatedCodesText = useMemo(() => generatedCodes.join('\n'), [generatedCodes]);

  const regenerateMutation = useMutation({
    mutationFn: regenerateTwoFactorBackupCodes,
    onSuccess: async (data) => {
      setGeneratedCodes(data.backupCodes);
      setPassword('');
      setActionError(null);
      setAction('codes');
      await queryClient.invalidateQueries({ queryKey: meQueryKeys.all });
      toast.success('Backup codes regenerated.');
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
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: meQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: ['session'] }),
      ]);
      toast.success('Two-factor authentication disabled.');
      await navigate({ to: ROUTES.settingsSecurity });
    },
    onError: (error) => {
      setActionError(error instanceof Error ? error.message : 'Could not disable two-factor authentication.');
    },
  });

  useEffect(() => {
    if (pendingActionHandledRef.current) return;

    const pendingAction = pendingManagementActionRef.current;
    if (pendingAction !== TWO_FACTOR_REGENERATE_CODES_ACTION && pendingAction !== TWO_FACTOR_DISABLE_ACTION) {
      return;
    }

    pendingActionHandledRef.current = true;
    sessionStorage.removeItem(PENDING_SENSITIVE_ACTION_KEY);

    if (pendingAction === TWO_FACTOR_REGENERATE_CODES_ACTION) {
      regenerateMutation.mutate({});
      return;
    }

    disableMutation.mutate({});
  }, [disableMutation, regenerateMutation]);

  function resetToOverview() {
    setPassword('');
    setActionError(null);
    setGeneratedCodes([]);
    setAction('overview');
  }

  function handleRegenerateSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActionError(null);
    regenerateMutation.mutate({ password });
  }

  function handleDisableSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActionError(null);
    disableMutation.mutate({ password });
  }

  if (sessionPending) {
    return <Text textStyle="sm">Loading your security settings...</Text>;
  }

  if (!isTwoFactorEnabled && action !== 'codes') {
    return (
      <Stack as="section" gap="6" maxW="760px" pb="8">
        <PageIntro
          title="Two-factor authentication"
          description="Manage the second factor used to protect your account."
          actions={<BackToSettingsLink />}
        />
        <SurfacePanel p="5">
          <Stack gap="4">
            <Alert display="flex" alignItems="flex-start" gap="3" colorPalette="gray" borderColor="border.surface">
              <ShieldOff size={20} style={{ flexShrink: 0, marginTop: '0.125rem' }} />
              <Stack gap="1">
                <AlertTitle>2FA is not enabled</AlertTitle>
                <AlertDescription>
                  Enable two-factor authentication before managing authenticators or backup codes.
                </AlertDescription>
              </Stack>
            </Alert>
            <HStack justify="flex-end" gap="3" flexWrap="wrap">
              <Link to={ROUTES.settingsSecurity} style={{ color: 'var(--chakra-colors-fg-muted)', fontSize: '0.875rem', fontWeight: 600 }}>
                Back to settings
              </Link>
              <Link
                to={ROUTES.twoFactorSetup}
                style={{
                  display: 'inline-flex',
                  height: '2.5rem',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '0.5rem',
                  backgroundColor: 'var(--chakra-colors-teal-solid)',
                  padding: '0 1.25rem',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  color: 'var(--chakra-colors-fg-inverted)',
                }}
              >
                Enable 2FA
              </Link>
            </HStack>
          </Stack>
        </SurfacePanel>
      </Stack>
    );
  }

  return (
    <Stack as="section" gap="6" maxW="960px" pb="8">
      <PageIntro
        title="Two-factor authentication"
        description="Manage your authenticator app and backup codes."
        actions={<BackToSettingsLink />}
      />

      {action === 'overview' ? (
        <ManagementOverview
          authenticatorLinkedAt={authenticatorLinkedAt}
          backupCodeCount={backupCodeCount}
          backupCodesUpdatedAt={backupCodesUpdatedAt}
          onDisable={() => {
            setActionError(null);
            setPassword('');
            setAction('disable');
          }}
          onRegenerate={() => {
            setActionError(null);
            setPassword('');
            setAction('regenerate');
          }}
        />
      ) : null}

      {action === 'regenerate' ? (
        <SensitiveActionPanel
          tone="warning"
          title="Regenerate backup codes"
          description="Regenerating codes will invalidate all existing backup codes. Only the new codes shown afterwards will work."
        >
          <SensitiveActionVerificationStep
            actionLabel="Regenerating codes"
            errorMessage={displayedError}
            isPending={regenerateMutation.isPending || meQuery.isPending}
            method={verificationMethod}
            oauthCallbackURL={getManagementCallbackURL()}
            oauthPendingAction={TWO_FACTOR_REGENERATE_CODES_ACTION}
            oauthReturnDescription="You will return to this management page after confirming your account."
            password={password}
            setPassword={setPassword}
            onCancel={resetToOverview}
            onPasswordSubmit={handleRegenerateSubmit}
          />
        </SensitiveActionPanel>
      ) : null}

      {action === 'disable' ? (
        <SensitiveActionPanel
          tone="danger"
          title="Disable two-factor authentication"
          description="Disabling 2FA removes an important layer of account protection and makes your account more vulnerable."
        >
          <SensitiveActionVerificationStep
            actionLabel="Disabling 2FA"
            errorMessage={displayedError}
            isPending={disableMutation.isPending || meQuery.isPending}
            method={verificationMethod}
            oauthCallbackURL={getManagementCallbackURL()}
            oauthPendingAction={TWO_FACTOR_DISABLE_ACTION}
            oauthReturnDescription="You will return to this management page after confirming your account."
            password={password}
            setPassword={setPassword}
            onCancel={resetToOverview}
            onPasswordSubmit={handleDisableSubmit}
          />
        </SensitiveActionPanel>
      ) : null}

      {action === 'codes' ? (
        <GeneratedBackupCodesPanel
          codes={generatedCodes}
          codesText={generatedCodesText}
          onDone={resetToOverview}
        />
      ) : null}
    </Stack>
  );
}

function BackToSettingsLink() {
  return (
    <Link
      to={ROUTES.settingsSecurity}
      style={{
        alignItems: 'center',
        color: 'var(--chakra-colors-fg-muted)',
        display: 'inline-flex',
        fontSize: '0.875rem',
        fontWeight: 600,
        gap: '0.375rem',
      }}
    >
      <ArrowLeft size={16} />
      Settings
    </Link>
  );
}

function ManagementOverview({
  authenticatorLinkedAt,
  backupCodeCount,
  backupCodesUpdatedAt,
  onDisable,
  onRegenerate,
}: {
  authenticatorLinkedAt: string | null;
  backupCodeCount: number | null;
  backupCodesUpdatedAt: string | null;
  onDisable: () => void;
  onRegenerate: () => void;
}) {
  return (
    <Stack gap="5">
      <Alert
        display="flex"
        alignItems="flex-start"
        gap="3"
        borderColor="teal.muted"
        bg="teal.subtle"
      >
        <ShieldCheck size={22} style={{ flexShrink: 0, marginTop: '0.125rem' }} />
        <Stack gap="1">
          <HStack gap="2" flexWrap="wrap">
            <AlertTitle>2FA is enabled</AlertTitle>
            <Badge variant="secondary" colorPalette="teal">Enabled</Badge>
          </HStack>
          <AlertDescription>
            We recommend keeping two-factor authentication enabled to help protect your account.
          </AlertDescription>
        </Stack>
      </Alert>

      <SectionPanel>
        <SectionRow
          icon={<Smartphone size={21} />}
          title="Authenticator app linked"
          description={authenticatorLinkedAt ? `Added on ${authenticatorLinkedAt}` : 'A TOTP authenticator app is connected to this account.'}
          actions={(
            <>
              <Button type="button" variant="outline" minW={{ md: '240px' }} onClick={() => window.location.assign(getReplaceAuthenticatorURL())}>
                <RotateCw size={16} />
                Reconnect
              </Button>
              <Text fontSize="xs" color="fg.muted" textAlign={{ base: 'left', md: 'right' }}>
                Replace your current authenticator
              </Text>
            </>
          )}
        />

        <Separator />

        <SectionRow
          icon={<KeyRound size={21} />}
          title={backupCodeCount === null ? 'Backup codes available' : `${backupCodeCount} backup codes available`}
          description={backupCodesUpdatedAt
            ? `Last regenerated on ${backupCodesUpdatedAt}. Existing codes cannot be viewed again.`
            : 'Existing codes cannot be viewed again. Regenerate codes if you need a new set.'}
          actions={(
            <Button type="button" variant="outline" minW={{ md: '240px' }} onClick={onRegenerate}>
              <RotateCw size={16} />
              Regenerate codes
            </Button>
          )}
        />
      </SectionPanel>

      <SectionPanel danger>
        <Grid
          gap="4"
          p={{ base: '4', md: '5' }}
          templateColumns={{ base: '1fr', md: 'minmax(0, 1fr) auto' }}
          alignItems="center"
        >
          <HStack align="flex-start" gap="4">
            <Flex
              boxSize="11"
              align="center"
              justify="center"
              rounded="md"
              bg="red.subtle"
              color="fg.error"
              flexShrink="0"
            >
              <ShieldOff size={21} />
            </Flex>
            <Stack gap="1">
              <Text fontWeight="semibold" color="fg.error">
                Danger zone
              </Text>
              <Text fontSize="sm" fontWeight="semibold" color="fg">
                Disable two-factor authentication
              </Text>
              <Text fontSize="sm" color="fg.muted">
                This will remove 2FA protection from your account.
              </Text>
            </Stack>
          </HStack>

          <Button type="button" variant="outline" colorPalette="red" minW={{ md: '240px' }} onClick={onDisable}>
            Disable 2FA
          </Button>
        </Grid>
      </SectionPanel>
    </Stack>
  );
}

function SensitiveActionPanel({
  children,
  description,
  title,
  tone,
}: {
  children: ReactNode;
  description: string;
  title: string;
  tone: 'danger' | 'warning';
}) {
  const isDanger = tone === 'danger';

  return (
    <SurfacePanel p={{ base: '4', md: '5' }}>
      <Stack gap="5">
        <Alert
          variant={isDanger ? 'destructive' : 'default'}
          colorPalette={isDanger ? 'red' : 'orange'}
          display="flex"
          alignItems="flex-start"
          gap="3"
          borderColor={isDanger ? 'border.error' : 'orange.300'}
          bg={isDanger ? undefined : 'orange.50'}
          color={isDanger ? undefined : 'orange.800'}
        >
          <AlertTriangle size={20} style={{ flexShrink: 0, marginTop: '0.125rem' }} />
          <Stack gap="1">
            <AlertTitle>{title}</AlertTitle>
            <AlertDescription color={isDanger ? undefined : 'orange.800'}>
              {description}
            </AlertDescription>
          </Stack>
        </Alert>

        {children}
      </Stack>
    </SurfacePanel>
  );
}

function GeneratedBackupCodesPanel({
  codes,
  codesText,
  onDone,
}: {
  codes: string[];
  codesText: string;
  onDone: () => void;
}) {
  return (
    <SurfacePanel p={{ base: '4', md: '5' }}>
      <VStack align="stretch" gap="5">
        <Stack gap="1">
          <Text fontSize="lg" fontWeight="semibold" color="fg">
            New backup codes
          </Text>
          <Text fontSize="sm" color="fg.muted">
            Store these codes now. You will not be able to view them again after leaving this page.
          </Text>
        </Stack>

        <Grid
          borderWidth="1px"
          borderColor="border.surface"
          rounded="md"
          overflow="hidden"
          templateColumns={{ base: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }}
        >
          {codes.map((code, index) => (
            <HStack
              key={code}
              justify="space-between"
              gap="3"
              px="4"
              py="3"
              borderBottomWidth={index < codes.length - 1 ? '1px' : undefined}
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
                <ClipboardCopy size={16} />
              </Button>
            </HStack>
          ))}
        </Grid>

        <Alert display="flex" alignItems="center" gap="3">
          <LockKeyhole size={18} />
          <AlertDescription>
            Each code can only be used once. Save them in a password manager or another secure place.
          </AlertDescription>
        </Alert>

        <HStack justify="space-between" gap="3" flexWrap="wrap">
          <HStack gap="2" flexWrap="wrap">
            <Button type="button" variant="outline" onClick={() => downloadBackupCodes(codes)}>
              <Download size={16} />
              Download codes
            </Button>
            <Button type="button" variant="outline" onClick={() => copyText(codesText, 'Backup codes copied.')}>
              <ClipboardCopy size={16} />
              Copy all
            </Button>
          </HStack>
          <Button type="button" onClick={onDone}>
            Done
          </Button>
        </HStack>
      </VStack>
    </SurfacePanel>
  );
}
