import type { ComponentProps, FormEvent } from 'react';
import { useMemo, useRef, useState } from 'react';
import {
  Box,
  Collapsible,
  Flex,
  Grid,
  HStack,
  QrCode,
  Separator,
  Stack,
  Steps,
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
  ShieldCheck,
  Smartphone,
} from 'lucide-react';
import { toast } from 'sonner';
import { ROUTES } from '@/app/routes';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { authClient } from '@/lib/auth-client';

const TOTP_SECRET_REGEX = /secret=([^&]+)/;
const NON_DIGIT_REGEX = /\D/g;
const STEPS = ['Verify password', 'Scan QR code', 'Confirm code'] as const;
const OTP_CELL_IDS = ['otp-1', 'otp-2', 'otp-3', 'otp-4', 'otp-5', 'otp-6'] as const;
type SetupStep = 'password' | 'scan' | 'confirm' | 'success';

function getStepIndex(step: SetupStep) {
  if (step === 'password') return 0;
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
  if (window.history.length > 1) {
    window.history.back();
    return;
  }

  window.location.assign(ROUTES.settings);
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

function WizardStepper({ step }: { step: SetupStep }) {
  const currentIndex = getStepIndex(step);

  return (
    <Steps.Root
      aria-label="Two-factor setup progress"
      colorPalette="teal"
      count={STEPS.length}
      size="sm"
      step={currentIndex}
      variant="solid"
    >
      <Steps.List gap={{ base: '3', md: '5' }}>
        {STEPS.map((title, index) => (
          <Steps.Item key={title} index={index} title={title}>
            <Steps.Indicator>
              <Steps.Status complete={<Check size={15} />} incomplete={<Steps.Number />} />
            </Steps.Indicator>
            <Box display={{ base: index === currentIndex ? 'block' : 'none', sm: 'block' }}>
              <Steps.Title>{`${index + 1}. ${title}`}</Steps.Title>
              <Steps.Description>{getStepStatus(index, step)}</Steps.Description>
            </Box>
            <Steps.Separator />
          </Steps.Item>
        ))}
      </Steps.List>
    </Steps.Root>
  );
}

function SectionHeading({
  title,
  description,
}: {
  title: string;
  description: string;
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

function Panel(props: ComponentProps<typeof Box>) {
  return (
    <Box
      borderWidth="1px"
      borderColor="border.subtle"
      bg="bg.surface"
      rounded="md"
      p={{ base: '4', md: '5' }}
      {...props}
    />
  );
}

export function TwoFactorSetupPage() {
  const [password, setPassword] = useState('');
  const [codeDigits, setCodeDigits] = useState(['', '', '', '', '', '']);
  const [currentStep, setCurrentStep] = useState<SetupStep>('password');
  const [isEnabling, setIsEnabling] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [totpUri, setTotpUri] = useState<string | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);

  const secret = useMemo(() => {
    if (!totpUri) return null;
    const match = TOTP_SECRET_REGEX.exec(totpUri);
    return match?.[1] ? decodeURIComponent(match[1]) : null;
  }, [totpUri]);

  const verificationCode = codeDigits.join('');
  async function handleEnable(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setIsEnabling(true);
    const { data, error } = await authClient.twoFactor.enable({ password });
    setIsEnabling(false);
    if (error) {
      setErrorMessage(error.message ?? 'Could not enable 2FA.');
      return;
    }

    if (!data?.totpURI) {
      setErrorMessage('Could not generate a 2FA setup key.');
      return;
    }

    setTotpUri(data?.totpURI ?? null);
    setBackupCodes(data?.backupCodes ?? []);
    setCurrentStep('scan');
  }

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
    <Box w="100%" maxW="860px" mx="auto" pb={{ base: '4', md: '8' }}>
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
                  Set up two-factor authentication
                </CardTitle>
                <CardDescription>Protect your account with TOTP verification.</CardDescription>
              </Stack>
            </HStack>
          </Flex>
        </CardHeader>

        <CardContent px="0" pb="0">
          <Stack gap={{ base: '5', md: '6' }}>
            <WizardStepper step={currentStep} />
            <Separator />

            {currentStep === 'password' ? (
              <PasswordStep
                errorMessage={errorMessage}
                isEnabling={isEnabling}
                password={password}
                setPassword={setPassword}
                onCancel={cancelSetup}
                onSubmit={handleEnable}
              />
            ) : null}

            {currentStep === 'scan' && totpUri ? (
              <ScanStep
                backupCodes={backupCodes}
                secret={secret}
                totpUri={totpUri}
                onBack={() => setCurrentStep('password')}
                onContinue={() => {
                  setErrorMessage(null);
                  setCurrentStep('confirm');
                }}
              />
            ) : null}

            {currentStep === 'confirm' ? (
              <ConfirmStep
                codeDigits={codeDigits}
                errorMessage={errorMessage}
                isVerifying={isVerifying}
                setCodeDigits={setCodeDigits}
                onBack={() => {
                  setErrorMessage(null);
                  setCurrentStep('scan');
                }}
                onSubmit={handleVerify}
              />
            ) : null}

            {currentStep === 'success' ? <SuccessStep /> : null}
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}

function PasswordStep({
  errorMessage,
  isEnabling,
  password,
  setPassword,
  onCancel,
  onSubmit,
}: {
  errorMessage: string | null;
  isEnabling: boolean;
  password: string;
  setPassword: (value: string) => void;
  onCancel: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <chakra.form onSubmit={onSubmit}>
      <VStack align="stretch" gap="5">
        <SectionHeading
          title="Verify your password"
          description="For security reasons, enter your current password before continuing."
        />

        <Field maxW="sm">
          <FieldLabel htmlFor="two-factor-password">Current password</FieldLabel>
          <Input
            id="two-factor-password"
            type="password"
            required
            autoComplete="current-password"
            placeholder="Current password"
            value={password}
            aria-invalid={errorMessage ? true : undefined}
            onChange={(event) => setPassword(event.target.value)}
          />
        </Field>

        {errorMessage ? <FieldError>{errorMessage}</FieldError> : null}

        <Separator />

        <HStack justify="space-between" gap="3">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" loading={isEnabling} loadingText="Preparing 2FA">
            Continue
            <ArrowRight size={16} />
          </Button>
        </HStack>
      </VStack>
    </chakra.form>
  );
}

function ScanStep({
  backupCodes,
  secret,
  totpUri,
  onBack,
  onContinue,
}: {
  backupCodes: string[];
  secret: string | null;
  totpUri: string;
  onBack: () => void;
  onContinue: () => void;
}) {
  const [isManualKeyOpen, setIsManualKeyOpen] = useState(false);
  const setupKey = secret ?? '';
  const backupText = backupCodes.join('\n');

  return (
    <Stack gap="4">
      <Grid templateColumns={{ base: '1fr', md: '1fr 1fr' }} gap="4" alignItems="stretch">
        <Panel h="full" minH={{ md: '430px' }}>
          <VStack align="stretch" gap="5" h="full">
            <SectionHeading
              title="Scan this QR code"
              description="Open your authenticator app and scan the QR code below."
            />

            <Flex justify="center" align="center" flex="1" minH={{ md: '220px' }}>
              <Box
                aria-label="Authenticator setup QR code"
                bg="white"
                borderWidth="1px"
                borderColor="border.subtle"
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
                <Box
                  borderWidth="1px"
                  borderColor="border.subtle"
                  bg="bg.subtle"
                  rounded="md"
                  p="4"
                  mt="1"
                >
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
        </Panel>

        <Panel h="full" minH={{ md: '430px' }}>
          <VStack align="stretch" gap="5" h="full">
            <SectionHeading
              title="Backup codes"
              description="Save these codes in a safe place. You can use them to access your account if you lose your device. Each code can only be used once."
            />

            <Grid templateColumns={{ base: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }} gap="2" alignContent="start">
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
              <Button type="button" variant="outline" onClick={() => downloadBackupCodes(backupCodes)}>
                <Download size={16} />
                Download codes (TXT)
              </Button>
              <Button type="button" variant="outline" onClick={() => copyText(backupText, 'Backup codes copied.')}>
                <ClipboardCopy size={16} />
                Copy all codes
              </Button>
            </Grid>
          </VStack>
        </Panel>
      </Grid>

      <Separator />

      <HStack justify="space-between" gap="3" flexWrap="wrap">
        <Button type="button" variant="outline" onClick={onBack}>
          <ArrowLeft size={16} />
          Back
        </Button>
        <Button type="button" onClick={onContinue}>
          Continue to verify code
          <ArrowRight size={16} />
        </Button>
      </HStack>
    </Stack>
  );
}

function ConfirmStep({
  codeDigits,
  errorMessage,
  isVerifying,
  setCodeDigits,
  onBack,
  onSubmit,
}: {
  codeDigits: string[];
  errorMessage: string | null;
  isVerifying: boolean;
  setCodeDigits: (value: string[]) => void;
  onBack: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const otpInputRef = useRef<Array<HTMLInputElement | null>>([]);

  function updateDigit(index: number, value: string) {
    const nextValue = [...codeDigits];
    const digits = value.replace(NON_DIGIT_REGEX, '').split('');

    if (digits.length > 1) {
      digits.slice(0, 6 - index).forEach((digit, offset) => {
        nextValue[index + offset] = digit;
      });
      setCodeDigits(nextValue);
      otpInputRef.current[Math.min(index + digits.length, 5)]?.focus();
      return;
    }

    nextValue[index] = digits[0] ?? '';
    setCodeDigits(nextValue);

    if (digits[0] && index < 5) {
      otpInputRef.current[index + 1]?.focus();
    }
  }

  return (
    <chakra.form onSubmit={onSubmit}>
      <VStack align="stretch" gap="5">
        <VStack align="stretch" gap="5" maxW="md" mx="auto" w="100%">
          <SectionHeading
            title="Confirm your authenticator"
            description="Enter the 6-digit verification code from your authenticator app."
          />

          <Field>
            <FieldLabel id="totp-code-label">Verification code</FieldLabel>
            <HStack
              aria-labelledby="totp-code-label"
              role="group"
              gap="2"
              flexWrap="wrap"
              onPaste={(event) => {
                event.preventDefault();
                updateDigit(0, event.clipboardData.getData('text'));
              }}
            >
              {OTP_CELL_IDS.map((cellId, index) => (
                <Input
                  key={cellId}
                  ref={(node) => {
                    otpInputRef.current[index] = node;
                  }}
                  aria-label={`Digit ${index + 1}`}
                  autoComplete={index === 0 ? 'one-time-code' : 'off'}
                  autoFocus={index === 0}
                  inputMode="numeric"
                  maxLength={1}
                  pattern="[0-9]*"
                  value={codeDigits[index] ?? ''}
                  textAlign="center"
                  fontSize="lg"
                  fontWeight="semibold"
                  boxSize="11"
                  onChange={(event) => updateDigit(index, event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Backspace' && !codeDigits[index] && index > 0) {
                      otpInputRef.current[index - 1]?.focus();
                    }
                  }}
                />
              ))}
            </HStack>
          </Field>

          <Text fontSize="sm" color="fg.muted">
            Codes refresh every 30 seconds.
          </Text>

          {errorMessage ? <FieldError>{errorMessage}</FieldError> : null}
        </VStack>

        <Separator />

        <HStack justify="space-between" gap="3" flexWrap="wrap">
          <Button type="button" variant="outline" onClick={onBack}>
            <ArrowLeft size={16} />
            Back
          </Button>
          <Button type="submit" loading={isVerifying} loadingText="Enabling...">
            Enable two-factor authentication
          </Button>
        </HStack>
      </VStack>
    </chakra.form>
  );
}

function SuccessStep() {
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
            Two-factor authentication enabled
          </CardTitle>
          <CardDescription fontSize="md">
            Your account is now protected with an additional security layer.
          </CardDescription>
        </Stack>
      </VStack>

      <VStack
        align="stretch"
        gap="5"
        maxW="2xl"
        mx="auto"
        w="100%"
        borderWidth="1px"
        borderColor="border.subtle"
        rounded="md"
        p={{ base: '4', md: '5' }}
      >
        <HStack align="flex-start" gap="4">
          <Flex boxSize="12" align="center" justify="center" rounded="full" bg="teal.subtle" color="teal.fg" flexShrink="0">
            <Smartphone size={22} />
          </Flex>
          <Stack gap="1">
            <Text fontWeight="semibold" color="fg">
              Authenticator linked
            </Text>
            <Text fontSize="sm" color="fg.muted">
              Your authenticator app has been successfully connected.
            </Text>
          </Stack>
        </HStack>

        <Separator />

        <HStack align="flex-start" gap="4">
          <Flex boxSize="12" align="center" justify="center" rounded="full" bg="teal.subtle" color="teal.fg" flexShrink="0">
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

        <HStack
          align="flex-start"
          gap="3"
          borderWidth="1px"
          borderColor="teal.muted"
          bg="teal.subtle"
          color="fg"
          rounded="md"
          p="4"
        >
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
        <Button type="button" onClick={() => window.location.assign(ROUTES.settings)}>
          Done
        </Button>
      </HStack>
    </VStack>
  );
}
