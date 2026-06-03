import type { FormEvent } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Collapsible,
  Flex,
  Grid,
  HStack,
  QrCode,
  Separator,
  Stack,
  Text,
  VStack,
  chakra,
} from '@chakra-ui/react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  ClipboardCopy,
  Download,
  KeyRound,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
} from 'lucide-react';
import { toast } from 'sonner';
import { useSearch } from '@tanstack/react-router';
import { ROUTES } from '@/app/routes';
import { useWorkspaceSecondary } from '@/components/layout/workspace-context';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FieldError } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { OtpCodeInput } from '@/features/auth/components/otp-code-input';
import { useMeQuery } from '@/features/me/me.queries';
import {
  PENDING_SENSITIVE_ACTION_KEY,
  TWO_FACTOR_REPLACE_AUTHENTICATOR_ACTION,
  TWO_FACTOR_SETUP_ACTION,
  getSensitiveActionVerificationMethod,
  startTwoFactorSensitiveSetup,
} from '@/features/security/sensitive-action-verification.types';
import { SensitiveActionVerificationStep } from '@/features/security/sensitive-action-verification';
import { authClient } from '@/lib/auth-client';

const TOTP_SECRET_REGEX = /secret=([^&]+)/;
const STEPS = [
  { number: 1, title: 'Verify identity' },
  { number: 2, title: 'Scan QR code' },
  { number: 3, title: 'Confirm code' },
] as const;
type SetupStep = 'identity' | 'scan' | 'confirm' | 'success';
type SetupMode = 'setup' | 'replace';

function getSetupMode(): SetupMode {
  return new URLSearchParams(window.location.search).get('mode') === 'replace'
    ? 'replace'
    : 'setup';
}

function getSetupModeFromSearch(search: Record<string, unknown>): SetupMode {
  return search.mode === 'replace' ? 'replace' : getSetupMode();
}

function getStepIndex(step: SetupStep) {
  if (step === 'identity') return 0;
  if (step === 'scan') return 1;
  if (step === 'confirm') return 2;
  return 3;
}

function getStepStatus(index: number, currentStep: SetupStep) {
  const currentIndex = getStepIndex(currentStep);
  if (currentStep === 'success' || index < currentIndex) return 'Completed';
  if (index === currentIndex) return 'In progress';
  return 'Pending';
}

function cancelSetup() {
  window.location.assign(ROUTES.settingsSecurity);
}

async function copyText(value: string, successMessage: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(successMessage);
  } catch {
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
  } catch {
    toast.error('Could not download backup codes.');
  }
}

function WorkflowStepper({ step }: { step: SetupStep }) {
  const currentIndex = Math.min(getStepIndex(step), STEPS.length - 1);

  return (
    <Box aria-label="Two-factor setup progress" role="list" w="100%" overflowX="auto" pb="1">
      <HStack minW={{ base: '640px', md: '0' }} align="flex-start" gap="0">
        {STEPS.map(({ number, title }, index) => {
          const isCompleted = step === 'success' || index < currentIndex;
          const isCurrent = step !== 'success' && index === currentIndex;
          const circleBg = isCompleted ? 'teal.solid' : isCurrent ? 'teal.subtle' : 'bg.surface';
          const circleBorder = isCompleted || isCurrent ? 'teal.solid' : 'border.surface';
          const circleColor = isCompleted ? 'fg.inverted' : isCurrent ? 'teal.fg' : 'fg.muted';
          const lineColor = isCompleted ? 'teal.solid' : 'border.surface';
          const status = getStepStatus(index, step);

          return (
            <HStack
              key={title}
              role="listitem"
              flex={index === STEPS.length - 1 ? '0 0 auto' : '1 1 0'}
              align="flex-start"
              gap="3"
              minW="0"
            >
              <Flex
                boxSize={{ base: '8', md: '9' }}
                align="center"
                justify="center"
                rounded="full"
                borderWidth="2px"
                borderColor={circleBorder}
                bg={circleBg}
                color={circleColor}
                flexShrink="0"
                fontSize="sm"
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
              {index < STEPS.length - 1 ? (
                <Box
                  h="1px"
                  flex="1"
                  minW="8"
                  bg={lineColor}
                  mt={{ base: '4', md: '4.5' }}
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

function SectionHeading({ title, description }: { title: string; description: string }) {
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

export function TwoFactorSetupPage() {
  const meQuery = useMeQuery();
  const search = useSearch({ strict: false }) as Record<string, unknown>;
  const mode = getSetupModeFromSearch(search);
  const isReplaceMode = mode === 'replace';
  const pendingSetupAction = isReplaceMode
    ? TWO_FACTOR_REPLACE_AUTHENTICATOR_ACTION
    : TWO_FACTOR_SETUP_ACTION;
  const [password, setPassword] = useState('');
  const [codeDigits, setCodeDigits] = useState(['', '', '', '', '', '']);
  const [currentStep, setCurrentStep] = useState<SetupStep>('identity');
  const [isEnabling, setIsEnabling] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [totpUri, setTotpUri] = useState<string | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const verificationMethod = getSensitiveActionVerificationMethod(meQuery.data?.authMethods);
  const displayedErrorMessage =
    errorMessage ?? (meQuery.isError ? 'Could not load your sign-in methods.' : null);

  useWorkspaceSecondary(null);

  const secret = useMemo(() => {
    if (!totpUri) return null;
    const match = TOTP_SECRET_REGEX.exec(totpUri);
    return match?.[1] ? decodeURIComponent(match[1]) : null;
  }, [totpUri]);

  const verificationCode = codeDigits.join('');
  const startSetup = useCallback(async (passwordValue?: string) => {
    setErrorMessage(null);
    setIsEnabling(true);

    try {
      const data = await startTwoFactorSensitiveSetup({ password: passwordValue });

      if (!data?.totpURI) {
        setErrorMessage('Could not generate a 2FA setup key.');
        return;
      }

      setTotpUri(data?.totpURI ?? null);
      setBackupCodes(data?.backupCodes ?? []);
      setCurrentStep('scan');
      sessionStorage.removeItem(PENDING_SENSITIVE_ACTION_KEY);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not prepare 2FA.');
    } finally {
      setIsEnabling(false);
    }
  }, []);

  async function handleEnable(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await startSetup(password);
  }

  useEffect(() => {
    if (currentStep !== 'identity' || verificationMethod.type !== 'oauth' || isEnabling) {
      return;
    }

    if (sessionStorage.getItem(PENDING_SENSITIVE_ACTION_KEY) !== pendingSetupAction) {
      return;
    }

    void startSetup();
  }, [currentStep, isEnabling, pendingSetupAction, startSetup, verificationMethod.type]);

  async function handleVerify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);

    if (verificationCode.length !== 6) {
      setErrorMessage('Enter the 6-digit code from your authenticator app.');
      return;
    }

    setIsVerifying(true);
    const { error } = await authClient.twoFactor.verifyTotp({ code: verificationCode });
    setIsVerifying(false);
    if (error) {
      setErrorMessage(error.message ?? 'Verification failed.');
      return;
    }
    setCurrentStep('success');
  }

  return (
    <Box w="100%" maxW="6xl" mx="auto" pt={{ base: '3', md: '6' }} pb={{ base: '4', md: '8' }}>
      <Card rounded="md" shadow="sm" p={{ base: '5', md: '7' }}>
        <CardHeader px="0" pb="5">
          <Flex align={{ base: 'flex-start', sm: 'center' }} gap="4">
            <HStack align="flex-start" gap="4">
              <Flex
                boxSize="9"
                align="center"
                justify="center"
                rounded="md"
                bg="teal.subtle"
                color="teal.fg"
                flexShrink="0"
              >
                <ShieldCheck size={18} />
              </Flex>
              <Stack gap="1">
                <CardTitle as="h1" fontSize={{ base: 'xl', md: '2xl' }}>
                  {isReplaceMode ? 'Reconnect authenticator' : 'Set up two-factor authentication'}
                </CardTitle>
                <CardDescription>
                  {isReplaceMode
                    ? 'Replace the authenticator app connected to your account.'
                    : 'Protect your account with TOTP verification.'}
                </CardDescription>
              </Stack>
            </HStack>
          </Flex>
        </CardHeader>

        <CardContent px="0" pb="0">
          <Stack gap={{ base: '5', md: '6' }}>
            <WorkflowStepper step={currentStep} />
            <Separator />

            {isReplaceMode ? (
              <Alert
                display="flex"
                alignItems="flex-start"
                gap="3"
                borderColor="orange.300"
                bg="orange.50"
                color="orange.800"
              >
                <ShieldAlert size={20} style={{ flexShrink: 0, marginTop: '0.125rem' }} />
                <Stack gap="1">
                  <AlertTitle>Replacing your current authenticator</AlertTitle>
                  <AlertDescription color="orange.800">
                    Your previous authenticator app will stop working after the new setup key is
                    created.
                  </AlertDescription>
                </Stack>
              </Alert>
            ) : null}

            {currentStep === 'identity' ? (
              <SensitiveActionVerificationStep
                actionLabel={isReplaceMode ? 'Preparing replacement' : 'Preparing 2FA'}
                errorMessage={displayedErrorMessage}
                isPending={isEnabling || meQuery.isPending}
                method={verificationMethod}
                oauthPendingAction={pendingSetupAction}
                password={password}
                setPassword={setPassword}
                onCancel={cancelSetup}
                onPasswordSubmit={handleEnable}
              />
            ) : null}

            {currentStep === 'scan' && totpUri ? (
              <ScanStep
                backupCodes={backupCodes}
                isReplaceMode={isReplaceMode}
                secret={secret}
                totpUri={totpUri}
                onBack={() => setCurrentStep('identity')}
                onCancel={cancelSetup}
                onContinue={() => {
                  setErrorMessage(null);
                  setCurrentStep('confirm');
                }}
              />
            ) : null}

            {currentStep === 'confirm' ? (
              <ConfirmStep
                codeDigits={codeDigits}
                errorMessage={displayedErrorMessage}
                isVerifying={isVerifying}
                isReplaceMode={isReplaceMode}
                setCodeDigits={setCodeDigits}
                onCancel={cancelSetup}
                onBack={() => {
                  setErrorMessage(null);
                  setCurrentStep('scan');
                }}
                onSubmit={handleVerify}
              />
            ) : null}

            {currentStep === 'success' ? <SuccessStep isReplaceMode={isReplaceMode} /> : null}
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}

function ScanStep({
  backupCodes,
  isReplaceMode,
  secret,
  totpUri,
  onBack,
  onCancel,
  onContinue,
}: {
  backupCodes: string[];
  isReplaceMode: boolean;
  secret: string | null;
  totpUri: string;
  onBack: () => void;
  onCancel: () => void;
  onContinue: () => void;
}) {
  const [isManualKeyOpen, setIsManualKeyOpen] = useState(false);
  const setupKey = secret ?? '';
  const backupText = backupCodes.join('\n');

  return (
    <Stack gap="4">
      <Grid
        templateColumns={{ base: '1fr', md: 'minmax(0, 1fr) minmax(280px, 0.9fr)' }}
        gap={{ base: '6', md: '9' }}
        alignItems="start"
      >
        <VStack align="stretch" gap="5" h="full">
          <SectionHeading
            title="Scan this QR code"
            description={
              isReplaceMode
                ? 'Open your new authenticator app and scan the QR code below.'
                : 'Open your authenticator app and scan the QR code below.'
            }
          />

          <Flex justify="center" align="center" flex="1" minH={{ md: '220px' }}>
            <Box
              aria-label="Authenticator setup QR code"
              bg="white"
              borderWidth="1px"
              borderColor="border.surface"
              rounded="md"
              p={{ base: '3', sm: '4' }}
              role="img"
              shadow="xs"
            >
              <QrCode.Root value={totpUri} size="2xl" encoding={{ ecc: 'M' }}>
                <QrCode.Frame style={{ fill: '#000000' }}>
                  <QrCode.Pattern />
                </QrCode.Frame>
              </QrCode.Root>
            </Box>
          </Flex>

          <Collapsible.Root
            lazyMount
            open={isManualKeyOpen}
            unmountOnExit
            onOpenChange={(event) => setIsManualKeyOpen(event.open)}
          >
            <HStack gap="3" color="fg.subtle">
              <Separator flex="1" />
              <Collapsible.Trigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  colorPalette="teal"
                  size="sm"
                  onClick={() => setIsManualKeyOpen(!isManualKeyOpen)}
                >
                  Can't scan?
                  <Box
                    as={ChevronDown}
                    boxSize="4"
                    transition="transform 0.18s ease"
                    transform={isManualKeyOpen ? 'rotate(180deg)' : undefined}
                  />
                </Button>
              </Collapsible.Trigger>
              <Separator flex="1" />
            </HStack>

            <Collapsible.Content>
              <Box bg="bg.subtle" rounded="md" p="4" mt="1">
                <VStack align="stretch" gap="4">
                  <SectionHeading
                    title="Setup key (for manual entry)"
                    description="Use this key if you can't scan the QR code."
                  />

                  <HStack align="stretch" gap="2">
                    <Input
                      value={setupKey}
                      readOnly
                      aria-label="Setup key"
                      fontFamily="mono"
                      fontSize="sm"
                      minW="0"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      flexShrink="0"
                      onClick={() => copyText(setupKey, 'Setup key copied.')}
                    >
                      <ClipboardCopy size={16} />
                      Copy
                    </Button>
                  </HStack>

                  <Text fontSize="xs" color="fg.subtle">
                    Keep this key secret. Anyone with this key can access your account.
                  </Text>
                </VStack>
              </Box>
            </Collapsible.Content>
          </Collapsible.Root>
        </VStack>

        <VStack align="stretch" gap="5" h="full">
          <SectionHeading
            title={isReplaceMode ? 'New backup codes' : 'Backup codes'}
            description="Save these codes now. You will not be able to view them again after leaving this screen, and each code can only be used once."
          />

          <Grid
            templateColumns={{ base: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }}
            gap="2"
            alignContent="start"
          >
            {backupCodes.map((item) => (
              <Badge
                key={item}
                variant="secondary"
                colorPalette="gray"
                justifyContent="center"
                px="3"
                py="2"
                rounded="md"
                fontFamily="mono"
                fontSize="sm"
              >
                {item}
              </Badge>
            ))}
          </Grid>

          <Grid templateColumns="1fr" gap="2" mt={{ md: 'auto' }}>
            <Button
              type="button"
              variant="outline"
              onClick={() => downloadBackupCodes(backupCodes)}
            >
              <Download size={16} />
              Download TXT
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => copyText(backupText, 'Backup codes copied.')}
            >
              <ClipboardCopy size={16} />
              Copy all codes
            </Button>
          </Grid>
        </VStack>
      </Grid>

      <Separator />

      <HStack justify="space-between" gap="3" flexWrap="wrap">
        <HStack gap="2" flexWrap="wrap">
          <Button type="button" variant="outline" onClick={onBack}>
            <ArrowLeft size={16} />
            Back
          </Button>
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </HStack>
        <Button type="button" onClick={onContinue}>
          Verify code
          <ArrowRight size={16} />
        </Button>
      </HStack>
    </Stack>
  );
}

function ConfirmStep({
  codeDigits,
  errorMessage,
  isReplaceMode,
  isVerifying,
  setCodeDigits,
  onBack,
  onCancel,
  onSubmit,
}: {
  codeDigits: string[];
  errorMessage: string | null;
  isReplaceMode: boolean;
  isVerifying: boolean;
  setCodeDigits: (value: string[]) => void;
  onBack: () => void;
  onCancel: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <chakra.form onSubmit={onSubmit}>
      <VStack align="stretch" gap="5">
        <VStack align="stretch" gap="5" maxW="md" mx="auto" w="100%">
          <SectionHeading
            title="Confirm your authenticator"
            description="Enter the 6-digit verification code from your authenticator app."
          />

          <OtpCodeInput value={codeDigits} onChange={setCodeDigits} />

          <Text fontSize="sm" color="fg.muted">
            Codes refresh every 30 seconds.
          </Text>

          {errorMessage ? <FieldError>{errorMessage}</FieldError> : null}
        </VStack>

        <Separator />

        <HStack justify="space-between" gap="3" flexWrap="wrap">
          <HStack gap="2" flexWrap="wrap">
            <Button type="button" variant="outline" onClick={onBack}>
              <ArrowLeft size={16} />
              Back
            </Button>
            <Button type="button" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          </HStack>
          <Button
            type="submit"
            loading={isVerifying}
            loadingText={isReplaceMode ? 'Reconnecting...' : 'Enabling...'}
          >
            {isReplaceMode ? 'Reconnect' : 'Enable 2FA'}
          </Button>
        </HStack>
      </VStack>
    </chakra.form>
  );
}

function SuccessStep({ isReplaceMode }: { isReplaceMode: boolean }) {
  return (
    <VStack align="stretch" gap="7">
      <VStack gap="4" textAlign="center" py={{ base: '2', md: '3' }}>
        <Flex
          boxSize="20"
          align="center"
          justify="center"
          rounded="full"
          bg="teal.subtle"
          color="teal.fg"
        >
          <Check size={38} />
        </Flex>

        <Stack gap="2">
          <CardTitle as="h2" fontSize={{ base: 'xl', md: '2xl' }} textAlign="center">
            {isReplaceMode ? 'Authenticator reconnected' : 'Two-factor authentication enabled'}
          </CardTitle>
          <CardDescription fontSize="md">
            {isReplaceMode
              ? 'Your account now uses the new authenticator app.'
              : 'Your account is now protected with an additional security layer.'}
          </CardDescription>
        </Stack>
      </VStack>

      <VStack align="stretch" gap="5" maxW="2xl" mx="auto" w="100%">
        <HStack align="flex-start" gap="4">
          <Flex
            boxSize="12"
            align="center"
            justify="center"
            rounded="full"
            bg="teal.subtle"
            color="teal.fg"
            flexShrink="0"
          >
            <Smartphone size={22} />
          </Flex>
          <Stack gap="1">
            <Text fontWeight="semibold" color="fg">
              {isReplaceMode ? 'New authenticator linked' : 'Authenticator linked'}
            </Text>
            <Text fontSize="sm" color="fg.muted">
              {isReplaceMode
                ? 'Your previous authenticator app will no longer approve sign-ins.'
                : 'Your authenticator app has been successfully connected.'}
            </Text>
          </Stack>
        </HStack>

        <Separator />

        <HStack align="flex-start" gap="4">
          <Flex
            boxSize="12"
            align="center"
            justify="center"
            rounded="full"
            bg="teal.subtle"
            color="teal.fg"
            flexShrink="0"
          >
            <KeyRound size={22} />
          </Flex>
          <Stack gap="1">
            <Text fontWeight="semibold" color="fg">
              Backup codes generated
            </Text>
            <Text fontSize="sm" color="fg.muted">
              10 backup codes have been generated. Store them securely.
            </Text>
          </Stack>
        </HStack>

        <HStack align="flex-start" gap="3" bg="teal.subtle" color="fg" rounded="md" p="4">
          <ShieldCheck size={22} color="var(--chakra-colors-teal-fg)" />
          <Stack gap="1">
            <Text fontSize="sm" fontWeight="medium">
              Recovery codes are the only way to access your account if you lose your device.
            </Text>
            <Text fontSize="sm" color="fg.muted">
              We recommend saving them in a password manager.
            </Text>
          </Stack>
        </HStack>
      </VStack>

      <Separator />

      <HStack justify="flex-end">
        <Button type="button" onClick={() => window.location.assign(ROUTES.settingsSecurity)}>
          Done
        </Button>
      </HStack>
    </VStack>
  );
}
