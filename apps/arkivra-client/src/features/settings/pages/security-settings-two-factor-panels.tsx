/* eslint-disable react-refresh/only-export-components */
import type { FormEvent, ReactNode } from 'react';
import type { SensitiveActionVerificationMethod } from '@/features/security/sensitive-action-verification.types';
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
import { ClipboardCopy, KeyRound, ShieldCheck, ShieldOff } from 'lucide-react';
import { ROUTES } from '@/app/routes';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { toast } from '@/components/ui/toaster-store';
import { SensitiveActionVerificationStep } from '@/features/security/sensitive-action-verification';
import {
  TWO_FACTOR_DISABLE_ACTION,
  TWO_FACTOR_REGENERATE_CODES_ACTION,
} from '@/features/security/sensitive-action-verification.types';

const NON_DIGIT_REGEX = /\D/g;
const TWO_FACTOR_SETUP_STEPS = [
  { number: 1, title: 'Verify identity' },
  { number: 2, title: 'Scan QR code' },
  { number: 3, title: 'Confirm code' },
  { number: 4, title: 'Backup codes' },
] as const;

export type TwoFactorSetupStep = 'identity' | 'scan' | 'confirm' | 'codes' | 'success';

const securityInputStyleProps = {
  bg: 'bg.surface',
  borderColor: 'border',
  color: 'fg',
  _hover: { borderColor: 'border.strong' },
  _placeholder: { color: 'fg.subtle' },
} as const;

export function getSecurityCallbackURL() {
  return new URL(ROUTES.settingsSecurity, window.location.origin).toString();
}

function getPinInputValue(value: string) {
  return Array.from({ length: 6 }, (_, index) => value[index] ?? '');
}

async function copyText(value: string, successMessage: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(successMessage);
  } catch {
    toast.error('Could not copy to clipboard.');
  }
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
  const currentIndex = Math.min(
    getTwoFactorSetupStepIndex(step),
    TWO_FACTOR_SETUP_STEPS.length - 1,
  );

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

export function TwoFactorSetupShell({
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

export function TwoFactorSetupPanel({
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
        <Grid
          templateColumns={{ base: '1fr', lg: 'minmax(0, 1.1fr) minmax(18rem, 0.9fr)' }}
          gap={{ base: '5', lg: '8' }}
        >
          <Grid
            templateColumns={{ base: '1fr', md: 'auto auto minmax(0, 1fr)' }}
            alignItems="center"
            gap="5"
          >
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
                      size="md"
                      {...securityInputStyleProps}
                    />
                  </Clipboard.Input>
                </InputGroup>
              </Clipboard.Root>
            </Stack>
          </Grid>

          <VStack
            align="stretch"
            gap="4"
            borderLeftWidth={{ base: '0', lg: '1px' }}
            borderColor="border.muted"
            pl={{ base: '0', lg: '6' }}
          >
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
                  setVerificationCode(
                    details.value.join('').replace(NON_DIGIT_REGEX, '').slice(0, 6),
                  );
                }}
                onValueComplete={(details) => {
                  onCodeEntry();
                  setVerificationCode(
                    details.value.join('').replace(NON_DIGIT_REGEX, '').slice(0, 6),
                  );
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
      <IconButton aria-label="Copy setup key" variant="ghost" size="xs" me="-2">
        <Clipboard.Indicator />
      </IconButton>
    </Clipboard.Trigger>
  );
}

export function TwoFactorSetupBackupCodesPanel({
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
            Store these codes now. You will not be able to view them again after leaving this page,
            and each code can only be used once.
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
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => copyText(backupCodesText, 'Backup codes copied.')}
          >
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

export function TwoFactorManagePanel({
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
            {backupCodes.map((code) => (
              <Text
                key={code}
                rounded="md"
                bg="bg.subtle"
                px="3"
                py="2"
                fontFamily="mono"
                fontSize="sm"
                fontWeight="semibold"
              >
                {code}
              </Text>
            ))}
          </Grid>
          <HStack justify="space-between" gap="3" flexWrap="wrap">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => copyText(backupCodesText, 'Backup codes copied.')}
            >
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
    <Box
      rounded="md"
      borderWidth="1px"
      borderColor={danger ? 'border.error' : 'border.surface'}
      p="4"
    >
      <Stack gap="5" h="full">
        <Stack gap="2">
          <HStack align="center" gap="2.5">
            <Flex
              boxSize="5"
              align="center"
              justify="center"
              color={danger ? 'fg.error' : 'fg.muted'}
              flexShrink={0}
            >
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
        <Button
          type="button"
          size="sm"
          variant="outline"
          colorPalette={danger ? 'red' : undefined}
          w="full"
          onClick={onClick}
        >
          {actionLabel}
        </Button>
      </Stack>
    </Box>
  );
}
