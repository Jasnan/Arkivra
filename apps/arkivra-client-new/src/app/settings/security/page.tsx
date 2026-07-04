"use client"

import * as React from "react"
import {
  ArrowRight,
  Check,
  ChevronRight,
  ChevronUp,
  ClipboardCopy,
  Info,
  KeyRound,
  Laptop,
  Link2,
  LockKeyhole,
  LogOut,
  Mail,
  ShieldCheck,
  ShieldOff,
} from "lucide-react"
import { toast } from "sonner"

import { BaseLayout } from "@/components/layouts/base-layout"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { LoadingSpinner } from "@/components/ui/loading-spinner"
import { ApiError } from "@/lib/api"
import { authClient } from "@/lib/auth-client"
import { cn } from "@/lib/utils"
import {
  changeAccountPassword,
  disableTwoFactor,
  getMe,
  getSensitiveActionVerificationMethod,
  linkOAuthAccount,
  OAUTH_PROVIDERS,
  PENDING_SENSITIVE_ACTION_KEY,
  regenerateTwoFactorBackupCodes,
  requestEmailChange,
  SET_PASSWORD_ACTION,
  setAccountPassword,
  startTwoFactorSensitiveSetup,
  TWO_FACTOR_DISABLE_ACTION,
  TWO_FACTOR_REGENERATE_CODES_ACTION,
  TWO_FACTOR_REPLACE_AUTHENTICATOR_ACTION,
  TWO_FACTOR_SETUP_ACTION,
  unlinkOAuthAccount,
  type AuthSessionSummary,
  type MeResponse,
  type OAuthProviderId,
  type SensitiveActionVerificationMethod,
  type SessionManagementClient,
} from "./security.api"

type StatusTone = "verified" | "enabled" | "warning" | "inactive"
type TwoFactorSetupStep = "identity" | "scan" | "confirm" | "codes" | "success"
type TwoFactorManageAction = "overview" | "regenerate" | "disable" | "codes"

interface SessionUser {
  email?: string | null
  emailVerified?: boolean | null
  twoFactorEnabled?: boolean | null
}

const securityActionButtonClassName = "min-w-38"
const passwordUppercaseRegex = /[A-Z]/
const passwordLowercaseRegex = /[a-z]/
const passwordNumberRegex = /\d/
const passwordSpecialRegex = /[^A-Z0-9]/i
const totpSecretRegex = /secret=([^&]+)/
const nonDigitRegex = /\D/g

const statusToneClasses: Record<StatusTone, string> = {
  verified:
    "border-primary/20 bg-primary/10 text-foreground",
  enabled:
    "border-primary/20 bg-primary/10 text-foreground",
  warning:
    "border-border bg-muted text-muted-foreground",
  inactive: "border-border bg-muted text-muted-foreground",
}

function getSecurityCallbackURL() {
  return new URL("/settings/security", window.location.origin).toString()
}

function getPendingSensitiveAction() {
  if (typeof sessionStorage === "undefined") return null
  return sessionStorage.getItem(PENDING_SENSITIVE_ACTION_KEY)
}

function setPendingSensitiveAction(action: string) {
  if (typeof sessionStorage === "undefined") return
  sessionStorage.setItem(PENDING_SENSITIVE_ACTION_KEY, action)
}

function clearPendingSensitiveAction(action?: string) {
  if (typeof sessionStorage === "undefined") return
  if (!action || sessionStorage.getItem(PENDING_SENSITIVE_ACTION_KEY) === action) {
    sessionStorage.removeItem(PENDING_SENSITIVE_ACTION_KEY)
  }
}

function hasPendingSetPassword() {
  return getPendingSensitiveAction() === SET_PASSWORD_ACTION
}

function getTotpSecret(totpUri: string | null) {
  if (!totpUri) return null
  const match = totpSecretRegex.exec(totpUri)
  return match?.[1] ? decodeURIComponent(match[1]) : null
}

function formatShortDateTime(value: string | Date | null | undefined, fallback = "Not available") {
  if (!value) return fallback

  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return fallback

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date)
}

function getSessionTimestamp(value: string | Date | null | undefined) {
  if (!value) return 0
  const timestamp = new Date(value).getTime()
  return Number.isNaN(timestamp) ? 0 : timestamp
}

function isSessionActive(session: AuthSessionSummary) {
  if (!session.expiresAt) return true
  return getSessionTimestamp(session.expiresAt) > Date.now()
}

function sortSessions(sessions: AuthSessionSummary[], currentSessionId: string | undefined) {
  return [...sessions].sort((left, right) => {
    const leftIsCurrent = left.id === currentSessionId
    const rightIsCurrent = right.id === currentSessionId

    if (leftIsCurrent !== rightIsCurrent) return leftIsCurrent ? -1 : 1

    const leftIsActive = isSessionActive(left)
    const rightIsActive = isSessionActive(right)

    if (leftIsActive !== rightIsActive) return leftIsActive ? -1 : 1

    return getSessionTimestamp(right.updatedAt ?? right.createdAt) - getSessionTimestamp(left.updatedAt ?? left.createdAt)
  })
}

function getCurrentBrowserLabel() {
  if (typeof navigator === "undefined") return "Current browser"

  const userAgent = navigator.userAgent
  const browser = userAgent.includes("Firefox")
    ? "Firefox"
    : userAgent.includes("Edg")
      ? "Microsoft Edge"
      : userAgent.includes("Chrome")
        ? "Chrome"
        : userAgent.includes("Safari")
          ? "Safari"
          : "Browser"

  return `${browser} on ${navigator.platform || "this device"}`
}

function getCurrentHostLabel() {
  if (typeof window === "undefined") return "Local session"
  return window.location.host || "Local session"
}

function StatusBadge({ children, tone }: { children: React.ReactNode; tone: StatusTone }) {
  return (
    <Badge variant="outline" className={cn("font-medium", statusToneClasses[tone])}>
      {children}
    </Badge>
  )
}

function FieldError({ children }: { children: React.ReactNode }) {
  return <p className="text-sm font-medium text-destructive">{children}</p>
}

function FormField({
  children,
  label,
  htmlFor,
  className,
}: {
  children: React.ReactNode
  label: string
  htmlFor: string
  className?: string
}) {
  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  )
}

function PasswordInput(props: React.ComponentProps<typeof Input>) {
  return <Input type="password" {...props} />
}

function SecurityRow({
  actions,
  children,
  description,
  icon,
  title,
}: {
  actions?: React.ReactNode
  children?: React.ReactNode
  description: React.ReactNode
  icon: React.ReactNode
  title: string
}) {
  return (
    <section className="grid min-w-0 gap-4 rounded-md border bg-card p-4 shadow-sm md:grid-cols-[3rem_minmax(0,1fr)_auto] md:gap-5 lg:p-5">
      <div className="flex size-10 items-center justify-center rounded-md bg-muted text-muted-foreground" aria-hidden="true">
        {icon}
      </div>
      <div className="min-w-0 space-y-1">
        <h2 className="text-base font-semibold leading-tight">{title}</h2>
        {typeof description === "string" ? (
          <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>
        ) : (
          <div className="max-w-2xl text-sm text-muted-foreground">{description}</div>
        )}
      </div>
      {actions ? <div className="flex min-w-0 items-center md:justify-end">{actions}</div> : null}
      {children ? <div className="min-w-0 md:col-start-2 md:col-end-4">{children}</div> : null}
    </section>
  )
}

function ActionButtonContent({ children, open }: { children: React.ReactNode; open: boolean }) {
  return (
    <>
      {children}
      {open ? <ChevronUp /> : <ChevronRight />}
    </>
  )
}

function VerificationActions({
  children,
  errorMessage,
  onCancel,
}: {
  children?: React.ReactNode
  errorMessage: string | null
  onCancel: () => void
}) {
  return (
    <>
      {errorMessage ? <FieldError>{errorMessage}</FieldError> : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        {children ?? (
          <Button type="button" disabled>
            Continue
          </Button>
        )}
      </div>
    </>
  )
}

function SensitiveActionVerificationStep({
  actionLabel,
  errorMessage,
  isPending,
  method,
  oauthCallbackURL,
  oauthPendingAction = TWO_FACTOR_SETUP_ACTION,
  oauthReturnDescription = "You will return to this flow after confirming your account.",
  password,
  setPassword,
  onCancel,
  onPasswordSubmit,
}: {
  actionLabel: string
  errorMessage: string | null
  isPending: boolean
  method: SensitiveActionVerificationMethod
  oauthCallbackURL?: string
  oauthPendingAction?: string
  oauthReturnDescription?: string
  password: string
  setPassword: (value: string) => void
  onCancel: () => void
  onPasswordSubmit: (event: React.FormEvent<HTMLFormElement>) => void
}) {
  if (method.type === "password") {
    return (
      <form onSubmit={onPasswordSubmit} className="space-y-5">
        <div className="space-y-1">
          <h3 className="text-lg font-semibold">Verify your identity</h3>
          <p className="text-sm text-muted-foreground">For security reasons, enter your current password before continuing.</p>
        </div>
        <FormField htmlFor="sensitive-action-password" label="Current password" className="max-w-sm">
          <PasswordInput
            id="sensitive-action-password"
            autoComplete="current-password"
            required
            value={password}
            placeholder="Current password"
            aria-invalid={errorMessage ? true : undefined}
            onChange={(event) => setPassword(event.target.value)}
          />
        </FormField>
        <VerificationActions errorMessage={errorMessage} onCancel={onCancel}>
          <Button type="submit" disabled={isPending}>
            {isPending ? actionLabel : "Continue"}
            <ArrowRight />
          </Button>
        </VerificationActions>
      </form>
    )
  }

  if (method.type === "oauth") {
    const provider = OAUTH_PROVIDERS[method.provider]

    return (
      <div className="space-y-5">
        <div className="space-y-1">
          <h3 className="text-lg font-semibold">Verify your identity</h3>
          <p className="text-sm text-muted-foreground">For security reasons, confirm your {provider.label} account before continuing.</p>
        </div>
        <p className="max-w-lg text-sm text-muted-foreground">{oauthReturnDescription}</p>
        <VerificationActions errorMessage={errorMessage} onCancel={onCancel}>
          <Button
            type="button"
            disabled={isPending}
            onClick={async () => {
              setPendingSensitiveAction(oauthPendingAction)
              await authClient.signIn.social({
                provider: method.provider,
                callbackURL: oauthCallbackURL ?? window.location.href,
              })
            }}
          >
            {isPending ? `Opening ${provider.label}` : `Continue with ${provider.label}`}
            <ArrowRight />
          </Button>
        </VerificationActions>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h3 className="text-lg font-semibold">Verify your identity</h3>
        <p className="text-sm text-muted-foreground">This account does not have a supported sign-in method for identity verification yet.</p>
      </div>
      <VerificationActions errorMessage={errorMessage} onCancel={onCancel} />
    </div>
  )
}

function PasswordRequirements({ value }: { value: string }) {
  const requirements = [
    { label: "At least 12 characters", met: value.length >= 12 },
    { label: "One uppercase letter", met: passwordUppercaseRegex.test(value) },
    { label: "One lowercase letter", met: passwordLowercaseRegex.test(value) },
    { label: "One number", met: passwordNumberRegex.test(value) },
    { label: "One special character", met: passwordSpecialRegex.test(value) },
  ]
  const metCount = requirements.filter((item) => item.met).length

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Password requirements</h3>
        <div className="space-y-2">
          {requirements.map((item) => (
            <div key={item.label} className="flex items-center gap-2">
              <span className={cn("flex size-4 items-center justify-center rounded-full", item.met ? "text-primary" : "text-muted-foreground")}>
                {item.met ? <Check className="size-3.5" /> : <span className="size-2.5 rounded-full border border-current" />}
              </span>
              <span className={cn("text-sm", item.met ? "text-muted-foreground" : "text-muted-foreground/70")}>{item.label}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Password strength</h3>
        <div className="grid grid-cols-4 gap-1.5">
          {Array.from({ length: 4 }, (_, index) => (
            <div
              key={index}
              className={cn("h-1.5 rounded-full bg-muted", index < Math.min(4, metCount) ? "bg-primary" : undefined)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function ChangePasswordForm({ onCancel }: { onCancel: () => void }) {
  const [isChangingPassword, setIsChangingPassword] = React.useState(false)
  const [currentPassword, setCurrentPassword] = React.useState("")
  const [changedPassword, setChangedPassword] = React.useState("")
  const [confirmChangedPassword, setConfirmChangedPassword] = React.useState("")
  const [changePasswordError, setChangePasswordError] = React.useState<string | null>(null)

  function resetForm() {
    setChangePasswordError(null)
    setCurrentPassword("")
    setChangedPassword("")
    setConfirmChangedPassword("")
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setChangePasswordError(null)

    try {
      if (changedPassword.length < 8) throw new Error("Password must be at least 8 characters.")
      if (changedPassword !== confirmChangedPassword) throw new Error("Passwords do not match.")

      setIsChangingPassword(true)
      await changeAccountPassword({ currentPassword, newPassword: changedPassword })
      toast.success("Password updated.")
      onCancel()
      resetForm()
    } catch (error) {
      setChangePasswordError(error instanceof Error ? error.message : "Could not change password.")
    } finally {
      setIsChangingPassword(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_19rem] lg:gap-7">
      <div className="space-y-3">
        <div className="space-y-1">
          <h3 className="text-sm font-medium">Update password</h3>
          <p className="text-sm text-muted-foreground">Enter your current password and choose a new one.</p>
        </div>
        <FormField htmlFor="security-current-password" label="Current password">
          <PasswordInput
            id="security-current-password"
            autoComplete="current-password"
            required
            value={currentPassword}
            placeholder="Current password"
            onChange={(event) => setCurrentPassword(event.target.value)}
          />
        </FormField>
        <FormField htmlFor="security-change-new-password" label="New password">
          <PasswordInput
            id="security-change-new-password"
            autoComplete="new-password"
            minLength={8}
            required
            value={changedPassword}
            placeholder="Create a strong password"
            onChange={(event) => setChangedPassword(event.target.value)}
          />
        </FormField>
        <FormField htmlFor="security-change-confirm-password" label="Confirm password">
          <PasswordInput
            id="security-change-confirm-password"
            autoComplete="new-password"
            minLength={8}
            required
            value={confirmChangedPassword}
            placeholder="Repeat the new password"
            onChange={(event) => setConfirmChangedPassword(event.target.value)}
          />
        </FormField>
        {changePasswordError ? <FieldError>{changePasswordError}</FieldError> : null}
        <div className="flex justify-end gap-2.5">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              onCancel()
              resetForm()
            }}
          >
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={isChangingPassword}>
            {isChangingPassword ? "Updating..." : "Save"}
          </Button>
        </div>
      </div>
      <div className="border-t pt-4 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
        <PasswordRequirements value={changedPassword} />
      </div>
    </form>
  )
}

function SetPasswordForm({
  onCancel,
  onPasswordEnabled,
  verificationMethod,
}: {
  onCancel: () => void
  onPasswordEnabled: () => void
  verificationMethod: SensitiveActionVerificationMethod
}) {
  const [isSettingPassword, setIsSettingPassword] = React.useState(false)
  const [newPassword, setNewPassword] = React.useState("")
  const [confirmPassword, setConfirmPassword] = React.useState("")
  const [setPasswordError, setSetPasswordError] = React.useState<string | null>(null)
  const [needsOAuthVerification, setNeedsOAuthVerification] = React.useState(false)

  function resetForm() {
    setSetPasswordError(null)
    setNeedsOAuthVerification(false)
    setNewPassword("")
    setConfirmPassword("")
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSetPasswordError(null)
    setNeedsOAuthVerification(false)

    try {
      if (newPassword.length < 8) throw new Error("Password must be at least 8 characters.")
      if (newPassword !== confirmPassword) throw new Error("Passwords do not match.")

      setIsSettingPassword(true)
      await setAccountPassword({ newPassword })
      toast.success("Password sign-in enabled.")
      clearPendingSensitiveAction(SET_PASSWORD_ACTION)
      resetForm()
      onPasswordEnabled()
    } catch (error) {
      if (error instanceof ApiError && error.status === 403 && verificationMethod.type === "oauth") {
        setNeedsOAuthVerification(true)
      }

      setSetPasswordError(error instanceof Error ? error.message : "Could not set password.")
    } finally {
      setIsSettingPassword(false)
    }
  }

  async function handleOAuthVerification() {
    if (verificationMethod.type !== "oauth") return
    setPendingSensitiveAction(SET_PASSWORD_ACTION)
    await authClient.signIn.social({
      provider: verificationMethod.provider,
      callbackURL: getSecurityCallbackURL(),
    })
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_19rem] lg:gap-7">
      <div className="space-y-3">
        <div className="space-y-1">
          <h3 className="text-sm font-medium">Set password</h3>
          <p className="text-sm text-muted-foreground">
            Add password sign-in to this OAuth account. You can keep using your linked provider after setting a password.
          </p>
        </div>
        <FormField htmlFor="security-new-password" label="New password">
          <PasswordInput
            id="security-new-password"
            autoComplete="new-password"
            minLength={8}
            required
            value={newPassword}
            placeholder="Create a strong password"
            onChange={(event) => setNewPassword(event.target.value)}
          />
        </FormField>
        <FormField htmlFor="security-confirm-password" label="Confirm password">
          <PasswordInput
            id="security-confirm-password"
            autoComplete="new-password"
            minLength={8}
            required
            value={confirmPassword}
            placeholder="Repeat the new password"
            onChange={(event) => setConfirmPassword(event.target.value)}
          />
        </FormField>
        {setPasswordError ? <FieldError>{setPasswordError}</FieldError> : null}
        <div className="flex flex-wrap justify-end gap-2.5">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              onCancel()
              resetForm()
              clearPendingSensitiveAction(SET_PASSWORD_ACTION)
            }}
          >
            Cancel
          </Button>
          {needsOAuthVerification && verificationMethod.type === "oauth" ? (
            <Button type="button" size="sm" variant="outline" onClick={handleOAuthVerification}>
              Continue with {OAUTH_PROVIDERS[verificationMethod.provider].label}
            </Button>
          ) : null}
          <Button type="submit" size="sm" disabled={isSettingPassword}>
            {isSettingPassword ? "Setting password..." : "Save"}
          </Button>
        </div>
      </div>
      <div className="border-t pt-4 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
        <PasswordRequirements value={newPassword} />
      </div>
    </form>
  )
}

function PasswordSettingsRow({
  hasPassword,
  onPasswordEnabled,
  verificationMethod,
}: {
  hasPassword: boolean
  onPasswordEnabled: () => void
  verificationMethod: SensitiveActionVerificationMethod
}) {
  const [isChangePasswordOpen, setIsChangePasswordOpen] = React.useState(false)
  const [isSetPasswordOpen, setIsSetPasswordOpen] = React.useState(hasPendingSetPassword)

  return (
    <SecurityRow
      title="Password"
      description={
        hasPassword
          ? "Use a password to sign in to your Arkivra account."
          : "This account currently uses linked OAuth sign-in. You can set a password to sign in directly."
      }
      icon={<LockKeyhole className="size-5" strokeWidth={1.8} />}
      actions={
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge tone={hasPassword ? "enabled" : "inactive"}>{hasPassword ? "Enabled" : "Inactive"}</StatusBadge>
          {hasPassword ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={securityActionButtonClassName}
              onClick={() => setIsChangePasswordOpen((open) => !open)}
            >
              <ActionButtonContent open={isChangePasswordOpen}>Change password</ActionButtonContent>
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={securityActionButtonClassName}
              onClick={() => setIsSetPasswordOpen((open) => !open)}
            >
              <ActionButtonContent open={isSetPasswordOpen}>Set password</ActionButtonContent>
            </Button>
          )}
        </div>
      }
    >
      {hasPassword && isChangePasswordOpen ? (
        <div className="mt-4">
          <ChangePasswordForm onCancel={() => setIsChangePasswordOpen(false)} />
        </div>
      ) : null}
      {!hasPassword && isSetPasswordOpen ? (
        <div className="mt-4">
          <SetPasswordForm
            verificationMethod={verificationMethod}
            onCancel={() => setIsSetPasswordOpen(false)}
            onPasswordEnabled={() => {
              setIsSetPasswordOpen(false)
              onPasswordEnabled()
            }}
          />
        </div>
      ) : null}
    </SecurityRow>
  )
}

function EmailAddressSettingsRow({
  canChangeEmail,
  currentEmail,
  isEmailVerified,
  verificationMethod,
}: {
  canChangeEmail: boolean
  currentEmail: string
  isEmailVerified: boolean
  verificationMethod: SensitiveActionVerificationMethod
}) {
  const [isEmailChangeOpen, setIsEmailChangeOpen] = React.useState(false)
  const [newEmail, setNewEmail] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [emailChangeError, setEmailChangeError] = React.useState<string | null>(null)
  const [isSendingVerification, setIsSendingVerification] = React.useState(false)
  const [isRequestingEmailChange, setIsRequestingEmailChange] = React.useState(false)

  const emailChangeDescription = React.useMemo(() => {
    if (canChangeEmail) {
      return "To protect your account, confirm your password before changing your email address."
    }

    if (verificationMethod.type === "oauth") {
      return `Set a password before changing your Arkivra email. You can keep using ${OAUTH_PROVIDERS[verificationMethod.provider].label} after adding password sign-in.`
    }

    return "This account does not have a supported sign-in method for changing email yet."
  }, [canChangeEmail, verificationMethod])

  async function handleSendVerification() {
    setIsSendingVerification(true)
    try {
      const { error } = await authClient.sendVerificationEmail({
        email: currentEmail,
        callbackURL: getSecurityCallbackURL(),
      })

      if (error) throw new Error(error.message ?? "Could not send verification email.")
      toast.success("Verification email sent. Check your inbox to confirm your address.")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not send verification email.")
    } finally {
      setIsSendingVerification(false)
    }
  }

  async function handleEmailChangeSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setEmailChangeError(null)

    if (!canChangeEmail) {
      setEmailChangeError("Set a password before changing your email address.")
      return
    }

    try {
      const normalizedEmail = newEmail.trim().toLowerCase()
      if (!normalizedEmail) throw new Error("Enter a new email address.")
      if (normalizedEmail === currentEmail.toLowerCase()) throw new Error("Enter a different email address.")

      setIsRequestingEmailChange(true)
      const result = await requestEmailChange({
        callbackURL: getSecurityCallbackURL(),
        newEmail: normalizedEmail,
        password,
      })
      toast.success(result.message ?? "Email change requested. Check your email to confirm the change.")
      setIsEmailChangeOpen(false)
      setNewEmail("")
      setPassword("")
    } catch (error) {
      setEmailChangeError(error instanceof Error ? error.message : "Could not request email change.")
    } finally {
      setIsRequestingEmailChange(false)
    }
  }

  return (
    <SecurityRow
      title="Email address"
      description={
        <div className="space-y-0.5">
          <p className="text-foreground">{currentEmail || "No email address available."}</p>
          <p>Used for sign-in, notifications, and security alerts.</p>
        </div>
      }
      icon={<Mail className="size-5" strokeWidth={1.8} />}
      actions={
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge tone={isEmailVerified ? "verified" : "warning"}>{isEmailVerified ? "Verified" : "Unverified"}</StatusBadge>
          {!isEmailVerified ? (
            <Button type="button" size="sm" variant="outline" disabled={isSendingVerification} onClick={handleSendVerification}>
              {isSendingVerification ? "Sending..." : "Verify now"}
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={securityActionButtonClassName}
            onClick={() => setIsEmailChangeOpen((open) => !open)}
          >
            <ActionButtonContent open={isEmailChangeOpen}>Change email</ActionButtonContent>
          </Button>
        </div>
      }
    >
      {isEmailChangeOpen ? (
        <form onSubmit={handleEmailChangeSubmit} className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-7">
          <div className="space-y-3">
            <div className="space-y-1">
              <h3 className="text-sm font-medium">Change email address</h3>
              <p className="text-sm text-muted-foreground">{emailChangeDescription}</p>
            </div>
            <FormField htmlFor="security-current-email" label="Current email">
              <Input id="security-current-email" value={currentEmail} disabled />
            </FormField>
            <FormField htmlFor="security-new-email" label="New email">
              <Input
                id="security-new-email"
                type="email"
                autoComplete="email"
                required={canChangeEmail}
                disabled={!canChangeEmail}
                value={newEmail}
                placeholder="Enter new email address"
                onChange={(event) => setNewEmail(event.target.value)}
              />
            </FormField>
            {canChangeEmail ? (
              <FormField htmlFor="security-email-change-password" label="Current password">
                <PasswordInput
                  id="security-email-change-password"
                  autoComplete="current-password"
                  required
                  value={password}
                  placeholder="Enter your current password"
                  onChange={(event) => setPassword(event.target.value)}
                />
              </FormField>
            ) : null}
            {emailChangeError ? <FieldError>{emailChangeError}</FieldError> : null}
            <div className="flex justify-end gap-2.5">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setIsEmailChangeOpen(false)
                  setEmailChangeError(null)
                  setPassword("")
                }}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={!canChangeEmail || isRequestingEmailChange}>
                {isRequestingEmailChange ? "Sending..." : "Send confirmation email"}
              </Button>
            </div>
          </div>
          <div className="border-t pt-4 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
            <div className="flex items-start gap-3 rounded-md border border-border bg-muted p-4 text-muted-foreground">
              <Info className="mt-0.5 size-4 shrink-0" />
              <div className="space-y-1">
                <h3 className="text-sm font-semibold">What happens next?</h3>
                <p className="text-sm text-muted-foreground">
                  We'll send a confirmation link to your current email address. Your new email will be active once you confirm.
                </p>
              </div>
            </div>
          </div>
        </form>
      ) : null}
    </SecurityRow>
  )
}

function ProviderMark({ provider }: { provider: OAuthProviderId }) {
  return (
    <span className="flex size-10 shrink-0 items-center justify-center rounded-md border bg-background text-sm font-semibold">
      {OAUTH_PROVIDERS[provider].shortLabel}
    </span>
  )
}

function ConnectedSignInProviderRow({
  canConnect,
  canDisconnect,
  isConnected,
  isDisconnecting,
  isSelected,
  onConnect,
  onDisconnect,
  provider,
}: {
  canConnect: boolean
  canDisconnect: boolean
  isConnected: boolean
  isDisconnecting: boolean
  isSelected: boolean
  onConnect: () => void
  onDisconnect: () => void
  provider: OAuthProviderId
}) {
  const providerLabel = OAUTH_PROVIDERS[provider].label

  return (
    <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between md:px-5">
      <div className="flex min-w-0 items-center gap-4">
        <ProviderMark provider={provider} />
        <div className="min-w-0">
          <h3 className="font-semibold">{providerLabel}</h3>
          <p className="text-sm text-muted-foreground">{isConnected ? "Connected to your Arkivra account." : "Not connected"}</p>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-3">
        {isConnected ? (
          <span className="inline-flex items-center gap-2 text-sm font-semibold text-primary">
            <Check className="size-4" />
            Connected
          </span>
        ) : null}
        {isConnected && canDisconnect ? (
          <Button type="button" size="sm" variant="outline" disabled={isDisconnecting} onClick={onDisconnect}>
            {isDisconnecting ? "Disconnecting..." : "Disconnect"}
          </Button>
        ) : null}
        {!isConnected ? (
          <Button type="button" size="sm" variant="outline" className="min-w-30" disabled={!canConnect} onClick={onConnect}>
            <ActionButtonContent open={isSelected}>Connect</ActionButtonContent>
          </Button>
        ) : null}
      </div>
    </div>
  )
}

function LinkOAuthProviderForm({
  onCancel,
  onLinked,
  provider,
}: {
  onCancel: () => void
  onLinked: () => void
  provider: OAuthProviderId
}) {
  const [password, setPassword] = React.useState("")
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null)
  const [isLinking, setIsLinking] = React.useState(false)
  const providerLabel = OAUTH_PROVIDERS[provider].label

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorMessage(null)
    setIsLinking(true)

    try {
      const result = await linkOAuthAccount({
        callbackURL: getSecurityCallbackURL(),
        password,
        provider,
      })

      if (result.redirect && result.url) {
        window.location.assign(result.url)
        return
      }

      toast.success(`${providerLabel} is connected.`)
      setPassword("")
      onLinked()
      onCancel()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : `Could not connect ${providerLabel}.`)
    } finally {
      setIsLinking(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 bg-muted/40 px-4 py-4 md:px-5">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="font-semibold">Connect {providerLabel}</h3>
          <p className="text-sm text-muted-foreground">Enter your current password before connecting this provider.</p>
        </div>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label={`Collapse ${providerLabel} connection form`}
          onClick={() => {
            onCancel()
            setErrorMessage(null)
            setPassword("")
          }}
        >
          <ChevronUp />
        </Button>
      </div>
      <FormField htmlFor={`security-link-${provider}-password`} label="Current password" className="max-w-md">
        <PasswordInput
          id={`security-link-${provider}-password`}
          autoComplete="current-password"
          required
          value={password}
          placeholder="Current password"
          onChange={(event) => setPassword(event.target.value)}
        />
      </FormField>
      {errorMessage ? <FieldError>{errorMessage}</FieldError> : null}
      <div className="flex justify-end gap-2.5">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            onCancel()
            setErrorMessage(null)
            setPassword("")
          }}
        >
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={isLinking}>
          {isLinking ? "Connecting..." : "Continue"}
        </Button>
      </div>
    </form>
  )
}

function ConnectedSignInSettingsRow({
  hasPassword,
  oauthProviders,
  onAuthMethodsChanged,
}: {
  hasPassword: boolean
  oauthProviders: string[]
  onAuthMethodsChanged: () => void
}) {
  const [isManageConnectionsOpen, setIsManageConnectionsOpen] = React.useState(false)
  const [selectedProvider, setSelectedProvider] = React.useState<OAuthProviderId | null>(null)
  const [disconnectingProvider, setDisconnectingProvider] = React.useState<OAuthProviderId | null>(null)
  const connectedProviders = new Set(oauthProviders)
  const linkableProviders = Object.keys(OAUTH_PROVIDERS) as OAuthProviderId[]
  const connectedOAuthProviders = linkableProviders.filter((provider) => connectedProviders.has(provider))
  const isConnectionsOpen = isManageConnectionsOpen || selectedProvider !== null

  async function handleDisconnect(provider: OAuthProviderId) {
    setDisconnectingProvider(provider)
    try {
      await unlinkOAuthAccount({ provider })
      setSelectedProvider(null)
      toast.success(`${OAUTH_PROVIDERS[provider].label} is disconnected.`)
      onAuthMethodsChanged()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not disconnect sign-in provider.")
    } finally {
      setDisconnectingProvider(null)
    }
  }

  return (
    <SecurityRow
      title="Connected sign-in"
      description="Add trusted sign-in providers to your account. You can continue using your password at any time."
      icon={<Link2 className="size-5" strokeWidth={1.8} />}
      actions={
        <Button
          type="button"
          size="sm"
          variant="outline"
          className={securityActionButtonClassName}
          onClick={() => {
            setIsManageConnectionsOpen((open) => {
              if (open) setSelectedProvider(null)
              return !open
            })
          }}
        >
          <ActionButtonContent open={isConnectionsOpen}>Manage connections</ActionButtonContent>
        </Button>
      }
    >
      {isConnectionsOpen ? (
        <div className="mt-4 space-y-4">
          <div className="overflow-hidden rounded-md border bg-background">
            <div className="divide-y">
              {linkableProviders.map((provider) => {
                const isConnected = connectedProviders.has(provider)
                const canDisconnect = isConnected && (hasPassword || connectedOAuthProviders.some((other) => other !== provider))
                const isSelected = selectedProvider === provider

                return (
                  <React.Fragment key={provider}>
                    <ConnectedSignInProviderRow
                      provider={provider}
                      isConnected={isConnected}
                      isSelected={isSelected}
                      canConnect={hasPassword}
                      canDisconnect={canDisconnect}
                      isDisconnecting={disconnectingProvider === provider}
                      onConnect={() => setSelectedProvider(isSelected ? null : provider)}
                      onDisconnect={() => void handleDisconnect(provider)}
                    />
                    {isSelected && hasPassword ? (
                      <LinkOAuthProviderForm
                        provider={provider}
                        onCancel={() => setSelectedProvider(null)}
                        onLinked={onAuthMethodsChanged}
                      />
                    ) : null}
                  </React.Fragment>
                )
              })}
            </div>
          </div>
          {!hasPassword ? <p className="text-sm text-muted-foreground">Set a password before connecting another sign-in provider.</p> : null}
        </div>
      ) : null}
    </SecurityRow>
  )
}

function TwoFactorWorkflowStepper({ step }: { step: TwoFactorSetupStep }) {
  const steps = ["Verify identity", "Scan QR code", "Confirm code", "Backup codes"]
  const currentIndex = step === "identity" ? 0 : step === "scan" ? 1 : step === "confirm" ? 2 : 3

  return (
    <div aria-label="Two-factor setup progress" role="list" className="w-full overflow-x-auto pb-1">
      <div className="flex min-w-[46rem] items-start">
        {steps.map((title, index) => {
          const isCompleted = step === "success" || index < currentIndex
          const isCurrent = step !== "success" && index === currentIndex

          return (
            <div key={title} role="listitem" className={cn("flex items-start gap-3", index === steps.length - 1 ? "shrink-0" : "flex-1")}>
              <span
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-semibold",
                  isCompleted
                    ? "border-primary bg-primary text-primary-foreground"
                    : isCurrent
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border bg-background text-muted-foreground",
                )}
              >
                {index + 1}
              </span>
              <div className="min-w-0 pt-0.5">
                <p className={cn("font-semibold leading-tight", isCurrent || isCompleted ? "text-foreground" : "text-muted-foreground")}>{title}</p>
                <p className="text-sm text-muted-foreground">{isCompleted ? "Completed" : isCurrent ? "In progress" : "Pending"}</p>
              </div>
              {index < steps.length - 1 ? <div className={cn("mx-4 mt-3 h-px flex-1", isCompleted ? "bg-primary" : "bg-border")} /> : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function TwoFactorSetupShell({ children, step }: { children: React.ReactNode; step: TwoFactorSetupStep }) {
  return (
    <div className="rounded-md border p-4 lg:p-6">
      <div className="space-y-5">
        <TwoFactorWorkflowStepper step={step} />
        <div className="border-t" />
        {children}
      </div>
    </div>
  )
}

async function copyText(value: string, successMessage: string) {
  try {
    await navigator.clipboard.writeText(value)
    toast.success(successMessage)
  } catch {
    toast.error("Could not copy to clipboard.")
  }
}

function TwoFactorSetupPanel({
  errorMessage,
  isVerifying,
  onCancel,
  onCodeEntry,
  onSubmit,
  secret,
  setVerificationCode,
  step,
  totpUri,
  verificationCode,
}: {
  errorMessage: string | null
  isVerifying: boolean
  onCancel: () => void
  onCodeEntry: () => void
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void
  secret: string | null
  setVerificationCode: (value: string) => void
  step: TwoFactorSetupStep
  totpUri: string
  verificationCode: string
}) {
  return (
    <TwoFactorSetupShell step={step}>
      <form onSubmit={onSubmit} className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(18rem,0.9fr)] lg:gap-8">
        <div className="grid gap-5 md:grid-cols-[auto_auto_minmax(0,1fr)] md:items-center">
          <a
            href={totpUri}
            className="flex size-44 items-center justify-center rounded-md border bg-background p-4 text-center text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          >
            Open authenticator setup
          </a>
          <p className="text-center text-sm text-muted-foreground">OR</p>
          <div className="min-w-0 space-y-3">
            <div className="space-y-1">
              <h3 className="text-sm font-semibold">Can't scan?</h3>
              <p className="text-sm text-muted-foreground">Enter this code manually in your authenticator app.</p>
            </div>
            <div className="flex max-w-sm gap-2">
              <Input aria-label="Manual setup key" readOnly value={secret ?? ""} className="font-mono" />
              <Button type="button" variant="outline" size="icon" aria-label="Copy setup key" onClick={() => copyText(secret ?? "", "Setup key copied.")}>
                <ClipboardCopy />
              </Button>
            </div>
          </div>
        </div>
        <div className="space-y-4 border-t pt-4 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
          <FormField htmlFor="security-two-factor-code" label="Enter 6-digit code">
            <Input
              id="security-two-factor-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={verificationCode}
              maxLength={6}
              aria-invalid={errorMessage ? true : undefined}
              placeholder="123456"
              onChange={(event) => {
                onCodeEntry()
                setVerificationCode(event.target.value.replace(nonDigitRegex, "").slice(0, 6))
              }}
            />
          </FormField>
          {errorMessage ? <FieldError>{errorMessage}</FieldError> : null}
          <div className="flex justify-end gap-2.5">
            <Button type="button" size="sm" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={isVerifying || verificationCode.length !== 6} className="min-w-48">
              {isVerifying ? "Verifying..." : "Verify and continue"}
            </Button>
          </div>
        </div>
      </form>
    </TwoFactorSetupShell>
  )
}

function BackupCodesGrid({ backupCodes }: { backupCodes: string[] }) {
  return (
    <div className="grid overflow-hidden rounded-md border sm:grid-cols-2">
      {backupCodes.map((code, index) => (
        <div
          key={code}
          className={cn("flex items-center justify-between gap-3 border-b px-4 py-3 sm:[&:nth-child(odd)]:border-r", index >= backupCodes.length - 2 ? "sm:border-b-0" : undefined)}
        >
          <span className="font-mono text-sm font-semibold">{code}</span>
          <Button type="button" size="icon" variant="ghost" aria-label={`Copy backup code ${index + 1}`} onClick={() => copyText(code, "Backup code copied.")}>
            <ClipboardCopy className="size-4" />
          </Button>
        </div>
      ))}
    </div>
  )
}

function TwoFactorSetupBackupCodesPanel({
  backupCodes,
  backupCodesText,
  onDone,
}: {
  backupCodes: string[]
  backupCodesText: string
  onDone: () => void
}) {
  return (
    <TwoFactorSetupShell step="codes">
      <div className="space-y-5">
        <div className="space-y-1">
          <h3 className="font-semibold">Save your backup codes</h3>
          <p className="text-sm text-muted-foreground">
            Store these codes now. You will not be able to view them again after leaving this page, and each code can only be used once.
          </p>
        </div>
        <BackupCodesGrid backupCodes={backupCodes} />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button type="button" size="sm" variant="outline" onClick={() => copyText(backupCodesText, "Backup codes copied.")}>
            <ClipboardCopy />
            Copy all
          </Button>
          <Button type="button" size="sm" onClick={onDone}>
            Done
          </Button>
        </div>
      </div>
    </TwoFactorSetupShell>
  )
}

function TwoFactorManageActionCard({
  actionLabel,
  danger = false,
  description,
  icon,
  onClick,
  title,
}: {
  actionLabel: string
  danger?: boolean
  description: string
  icon: React.ReactNode
  onClick: () => void
  title: string
}) {
  return (
    <div className={cn("rounded-md border p-4", danger ? "border-destructive/40" : undefined)}>
      <div className="flex h-full flex-col gap-5">
        <div className="space-y-2">
          <div className="flex items-center gap-2.5">
            <span className={cn("flex size-5 items-center justify-center", danger ? "text-destructive" : "text-muted-foreground")}>{icon}</span>
            <h3 className={cn("text-sm font-semibold", danger ? "text-destructive" : undefined)}>{title}</h3>
          </div>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <Button type="button" size="sm" variant={danger ? "destructive" : "outline"} className="mt-auto w-full" onClick={onClick}>
          {actionLabel}
        </Button>
      </div>
    </div>
  )
}

function TwoFactorManagePanel({
  action,
  backupCodes,
  backupCodesText,
  errorMessage,
  isDisabling,
  isRegenerating,
  onCancel,
  onDisableSubmit,
  onReconnect,
  onRegenerateSubmit,
  onSelectAction,
  password,
  setPassword,
  verificationMethod,
}: {
  action: TwoFactorManageAction
  backupCodes: string[]
  backupCodesText: string
  errorMessage: string | null
  isDisabling: boolean
  isRegenerating: boolean
  onCancel: () => void
  onDisableSubmit: (event: React.FormEvent<HTMLFormElement>) => void
  onReconnect: () => void
  onRegenerateSubmit: (event: React.FormEvent<HTMLFormElement>) => void
  onSelectAction: (action: TwoFactorManageAction) => void
  password: string
  setPassword: (value: string) => void
  verificationMethod: SensitiveActionVerificationMethod
}) {
  if (action === "regenerate") {
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
    )
  }

  if (action === "disable") {
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
    )
  }

  if (action === "codes") {
    return (
      <div className="rounded-md border p-4">
        <div className="space-y-4">
          <div className="space-y-1">
            <h3 className="font-semibold">New backup codes</h3>
            <p className="text-sm text-muted-foreground">Store these codes now. They cannot be viewed again after leaving this page.</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {backupCodes.map((code) => (
              <div key={code} className="rounded-md bg-muted px-3 py-2 font-mono text-sm font-semibold">
                {code}
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button type="button" size="sm" variant="outline" onClick={() => copyText(backupCodesText, "Backup codes copied.")}>
              <ClipboardCopy />
              Copy all
            </Button>
            <Button type="button" size="sm" onClick={onCancel}>
              Done
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <TwoFactorManageActionCard
        icon={<ShieldCheck className="size-4" />}
        title="Authenticator app"
        description="Replace the authenticator app connected to this account."
        actionLabel="Replace authenticator"
        onClick={onReconnect}
      />
      <TwoFactorManageActionCard
        icon={<KeyRound className="size-4" />}
        title="Backup codes"
        description="Generate a new set if your existing backup codes are lost."
        actionLabel="Generate new codes"
        onClick={() => onSelectAction("regenerate")}
      />
      <TwoFactorManageActionCard
        danger
        icon={<ShieldOff className="size-4" />}
        title="Disable 2FA"
        description="Remove authenticator protection from this account."
        actionLabel="Disable 2FA"
        onClick={() => onSelectAction("disable")}
      />
    </div>
  )
}

function TwoFactorSettingsRow({
  isTwoFactorEnabled,
  onSecurityChanged,
  refreshMe,
  verificationMethod,
}: {
  isTwoFactorEnabled: boolean
  onSecurityChanged: (isEnabled: boolean) => void
  refreshMe: () => void
  verificationMethod: SensitiveActionVerificationMethod
}) {
  const pendingActionHandledRef = React.useRef(false)
  const [isOpen, setIsOpen] = React.useState(false)
  const [mode, setMode] = React.useState<"setup" | "manage">(isTwoFactorEnabled ? "manage" : "setup")
  const [password, setPassword] = React.useState("")
  const [totpUri, setTotpUri] = React.useState<string | null>(null)
  const [backupCodes, setBackupCodes] = React.useState<string[]>([])
  const [verificationCode, setVerificationCode] = React.useState("")
  const [isPreparingSetup, setIsPreparingSetup] = React.useState(false)
  const [isVerifying, setIsVerifying] = React.useState(false)
  const [isRegenerating, setIsRegenerating] = React.useState(false)
  const [isDisabling, setIsDisabling] = React.useState(false)
  const [setupStep, setSetupStep] = React.useState<TwoFactorSetupStep>("identity")
  const [actionError, setActionError] = React.useState<string | null>(null)
  const [manageAction, setManageAction] = React.useState<TwoFactorManageAction>("overview")
  const secret = getTotpSecret(totpUri)
  const backupCodesText = backupCodes.join("\n")

  const startSetup = React.useCallback(
    async (passwordValue?: string) => {
      setActionError(null)
      setIsPreparingSetup(true)
      try {
        const data = await startTwoFactorSensitiveSetup({ password: passwordValue })
        if (!data.totpURI) throw new Error("Could not generate a 2FA setup key.")
        setTotpUri(data.totpURI)
        setBackupCodes(data.backupCodes ?? [])
        setPassword("")
        setIsOpen(true)
        setMode("setup")
        setSetupStep("scan")
        clearPendingSensitiveAction()
      } catch (error) {
        setActionError(error instanceof Error ? error.message : "Could not prepare 2FA.")
      } finally {
        setIsPreparingSetup(false)
      }
    },
    [],
  )

  const regenerateCodes = React.useCallback(
    async (passwordValue?: string) => {
      setActionError(null)
      setIsRegenerating(true)
      try {
        const data = await regenerateTwoFactorBackupCodes({ password: passwordValue })
        setBackupCodes(data.backupCodes)
        setPassword("")
        setManageAction("codes")
        refreshMe()
        toast.success("Backup codes regenerated.")
        clearPendingSensitiveAction()
      } catch (error) {
        setActionError(error instanceof Error ? error.message : "Could not regenerate backup codes.")
      } finally {
        setIsRegenerating(false)
      }
    },
    [refreshMe],
  )

  const disableTwoFactorAction = React.useCallback(
    async (passwordValue?: string) => {
      setActionError(null)
      setIsDisabling(true)
      try {
        await disableTwoFactor({ password: passwordValue })
        setPassword("")
        setIsOpen(false)
        setMode("setup")
        setSetupStep("identity")
        setManageAction("overview")
        setTotpUri(null)
        setBackupCodes([])
        onSecurityChanged(false)
        refreshMe()
        toast.success("Two-factor authentication disabled.")
        clearPendingSensitiveAction()
      } catch (error) {
        setActionError(error instanceof Error ? error.message : "Could not disable two-factor authentication.")
      } finally {
        setIsDisabling(false)
      }
    },
    [onSecurityChanged, refreshMe],
  )

  React.useEffect(() => {
    if (verificationMethod.type !== "oauth") return
    if (pendingActionHandledRef.current) return

    const pendingAction = getPendingSensitiveAction()

    if (pendingAction === TWO_FACTOR_SETUP_ACTION || pendingAction === TWO_FACTOR_REPLACE_AUTHENTICATOR_ACTION) {
      pendingActionHandledRef.current = true
      void startSetup()
      return
    }

    if (pendingAction === TWO_FACTOR_REGENERATE_CODES_ACTION) {
      pendingActionHandledRef.current = true
      setIsOpen(true)
      setMode("manage")
      void regenerateCodes()
      return
    }

    if (pendingAction === TWO_FACTOR_DISABLE_ACTION) {
      pendingActionHandledRef.current = true
      setIsOpen(true)
      setMode("manage")
      void disableTwoFactorAction()
    }
  }, [disableTwoFactorAction, regenerateCodes, startSetup, verificationMethod.type])

  function handleToggle() {
    setIsOpen((open) => !open)
    setMode(isTwoFactorEnabled ? "manage" : "setup")
    setSetupStep("identity")
    setActionError(null)
    setPassword("")
  }

  function handleSetupSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void startSetup(password)
  }

  async function handleVerify(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setActionError(null)

    const normalizedCode = verificationCode.replace(nonDigitRegex, "")
    if (normalizedCode.length !== 6) {
      setActionError("Enter the 6-digit code from your authenticator app.")
      return
    }

    setIsVerifying(true)
    try {
      const { error } = await authClient.twoFactor.verifyTotp({ code: normalizedCode })
      if (error) {
        setActionError(error.message ?? "Verification failed.")
        return
      }

      onSecurityChanged(true)
      refreshMe()
      setSetupStep("codes")
    } finally {
      setIsVerifying(false)
    }
  }

  function resetManageAction() {
    setPassword("")
    setActionError(null)
    setManageAction("overview")
  }

  return (
    <SecurityRow
      title="Two-factor authentication"
      description={
        isTwoFactorEnabled
          ? "Your account requires an authenticator code at sign-in."
          : "Add a second sign-in step to keep your account and documents secure."
      }
      icon={<ShieldCheck className="size-5" strokeWidth={1.8} />}
      actions={
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge tone={isTwoFactorEnabled ? "enabled" : "warning"}>{isTwoFactorEnabled ? "Enabled" : "Disabled"}</StatusBadge>
          <Button type="button" size="sm" className={securityActionButtonClassName} onClick={handleToggle}>
            <ActionButtonContent open={isOpen}>{isTwoFactorEnabled ? "Manage 2FA" : "Enable 2FA"}</ActionButtonContent>
          </Button>
        </div>
      }
    >
      {isOpen ? (
        <div className="mt-4">
          {mode === "setup" && !totpUri ? (
            <TwoFactorSetupShell step="identity">
              <SensitiveActionVerificationStep
                actionLabel="Preparing 2FA"
                errorMessage={actionError}
                isPending={isPreparingSetup}
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
          {mode === "setup" && totpUri && setupStep !== "codes" ? (
            <TwoFactorSetupPanel
              errorMessage={actionError}
              isVerifying={isVerifying}
              secret={secret}
              step={setupStep}
              totpUri={totpUri}
              verificationCode={verificationCode}
              onCodeEntry={() => setSetupStep("confirm")}
              setVerificationCode={setVerificationCode}
              onCancel={() => setIsOpen(false)}
              onSubmit={handleVerify}
            />
          ) : null}
          {mode === "setup" && setupStep === "codes" ? (
            <TwoFactorSetupBackupCodesPanel
              backupCodes={backupCodes}
              backupCodesText={backupCodesText}
              onDone={() => {
                toast.success("Two-factor authentication enabled.")
                setMode("manage")
                setManageAction("overview")
                setIsOpen(false)
                setTotpUri(null)
                setVerificationCode("")
              }}
            />
          ) : null}
          {mode === "manage" ? (
            <TwoFactorManagePanel
              action={manageAction}
              backupCodes={backupCodes}
              backupCodesText={backupCodesText}
              errorMessage={actionError}
              isDisabling={isDisabling}
              isRegenerating={isRegenerating}
              password={password}
              setPassword={setPassword}
              verificationMethod={verificationMethod}
              onCancel={resetManageAction}
              onDisableSubmit={(event) => {
                event.preventDefault()
                void disableTwoFactorAction(password)
              }}
              onRegenerateSubmit={(event) => {
                event.preventDefault()
                void regenerateCodes(password)
              }}
              onReconnect={() => {
                setMode("setup")
                setSetupStep("identity")
                setTotpUri(null)
                setBackupCodes([])
                setVerificationCode("")
                setActionError(null)
                setPassword("")
              }}
              onSelectAction={setManageAction}
            />
          ) : null}
        </div>
      ) : null}
    </SecurityRow>
  )
}

function SettingsSessionsSection({ me }: { me: MeResponse | null }) {
  const sessionClient = authClient as SessionManagementClient
  const canListSessions = typeof sessionClient.listSessions === "function"
  const [sessions, setSessions] = React.useState<AuthSessionSummary[]>([])
  const [sessionsError, setSessionsError] = React.useState<string | null>(null)
  const [sessionsPending, setSessionsPending] = React.useState(canListSessions)
  const [isSigningOutOthers, setIsSigningOutOthers] = React.useState(false)
  const [revokingToken, setRevokingToken] = React.useState<string | null>(null)
  const sortedSessions = React.useMemo(() => sortSessions(sessions, me?.sessionId), [me?.sessionId, sessions])
  const visibleSessionCount = sortedSessions.length > 0 ? sortedSessions.length : 1

  const loadSessions = React.useCallback(async () => {
    if (!canListSessions || !sessionClient.listSessions) return
    setSessionsPending(true)
    try {
      const { data, error } = await sessionClient.listSessions()
      if (error) throw new Error(error.message ?? "Could not load sessions.")
      setSessions(data ?? [])
      setSessionsError(null)
    } catch (error) {
      setSessionsError(error instanceof Error ? error.message : "Could not load sessions.")
    } finally {
      setSessionsPending(false)
    }
  }, [canListSessions, sessionClient])

  React.useEffect(() => {
    void loadSessions()
  }, [loadSessions])

  async function handleSignOutOthers() {
    if (!sessionClient.revokeOtherSessions) return
    setIsSigningOutOthers(true)
    try {
      const { error } = await sessionClient.revokeOtherSessions()
      if (error) throw new Error(error.message ?? "Could not sign out other sessions.")
      toast.success("Other sessions signed out.")
      await loadSessions()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not sign out other sessions.")
    } finally {
      setIsSigningOutOthers(false)
    }
  }

  async function handleRevokeSession(session: AuthSessionSummary) {
    if (!sessionClient.revokeSession) return
    setRevokingToken(session.token)
    try {
      const { error } = await sessionClient.revokeSession({ token: session.token })
      if (error) throw new Error(error.message ?? "Could not revoke session.")
      toast.success("Session revoked.")
      await loadSessions()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not revoke session.")
    } finally {
      setRevokingToken(null)
    }
  }

  return (
    <SecurityRow
      title="Sessions"
      description={`You're currently signed in on ${visibleSessionCount} ${visibleSessionCount === 1 ? "device" : "devices"}.`}
      icon={<Laptop className="size-5" strokeWidth={1.8} />}
      actions={
        <Button type="button" size="sm" variant="outline" disabled={!canListSessions || isSigningOutOthers} onClick={handleSignOutOthers}>
          <LogOut />
          {isSigningOutOthers ? "Signing out..." : "Sign out others"}
        </Button>
      }
    >
      <div className="mt-4 space-y-2">
        {sessionsPending ? (
          <div className="flex items-center gap-2 rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
            <LoadingSpinner />
            Loading sessions...
          </div>
        ) : sessionsError ? (
          <div className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">{sessionsError}</div>
        ) : sortedSessions.length > 0 ? (
          sortedSessions.map((session) => {
            const isCurrentSession = session.id === me?.sessionId
            const lastActive = formatShortDateTime(session.updatedAt ?? session.createdAt)

            return (
              <div key={session.id} className="rounded-md border bg-muted/40 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                      <Laptop className="size-4" />
                    </div>
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold">{isCurrentSession ? "Current session" : "Active session"}</h3>
                        {isCurrentSession ? <StatusBadge tone="enabled">This device</StatusBadge> : null}
                      </div>
                      <p className="truncate text-sm text-muted-foreground">{session.userAgent || "Unknown browser or device"}</p>
                      <p className="truncate text-xs text-muted-foreground">{session.ipAddress || "Unknown address"} · Last active {lastActive}</p>
                    </div>
                  </div>
                  {isCurrentSession ? (
                    <span className="shrink-0 text-xs font-medium text-primary">Active now</span>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={revokingToken !== null}
                      onClick={() => void handleRevokeSession(session)}
                    >
                      {revokingToken === session.token ? "Revoking..." : "Revoke"}
                    </Button>
                  )}
                </div>
              </div>
            )
          })
        ) : (
          <div className="rounded-md border bg-muted/40 p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                  <Laptop className="size-4" />
                </div>
                <div className="min-w-0 space-y-0.5">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold">Current session</h3>
                    <StatusBadge tone="enabled">This device</StatusBadge>
                  </div>
                  <p className="truncate text-sm text-muted-foreground">
                    {getCurrentBrowserLabel()} · {getCurrentHostLabel()}
                  </p>
                </div>
              </div>
              <span className="shrink-0 text-xs font-medium text-primary">Active now</span>
            </div>
          </div>
        )}
      </div>
    </SecurityRow>
  )
}

export default function SecuritySettingsPage() {
  const { data: sessionData, isPending: sessionPending } = authClient.useSession()
  const [me, setMe] = React.useState<MeResponse | null>(null)
  const [meError, setMeError] = React.useState<string | null>(null)
  const [mePending, setMePending] = React.useState(true)
  const [twoFactorOverride, setTwoFactorOverride] = React.useState<boolean | null>(null)
  const sessionUser = sessionData?.user as SessionUser | undefined
  const isEmailVerified = sessionUser?.emailVerified === true
  const sessionTwoFactorEnabled = sessionUser?.twoFactorEnabled === true
  const isTwoFactorEnabled = twoFactorOverride ?? sessionTwoFactorEnabled
  const hasPassword = me?.authMethods?.hasPassword !== false
  const oauthProviders = me?.authMethods?.oauthProviders ?? []
  const verificationMethod = getSensitiveActionVerificationMethod(me?.authMethods)
  const canChangeEmail = verificationMethod.type === "password"
  const currentEmail = sessionUser?.email ?? ""

  const loadMe = React.useCallback(async (signal?: AbortSignal) => {
    setMePending(true)
    try {
      const data = await getMe(signal)
      setMe(data)
      setMeError(null)
    } catch (error) {
      if (signal?.aborted) return
      setMeError(error instanceof Error ? error.message : "Could not load security settings.")
    } finally {
      if (!signal?.aborted) {
        setMePending(false)
      }
    }
  }, [])

  React.useEffect(() => {
    const controller = new AbortController()
    void loadMe(controller.signal)
    return () => controller.abort()
  }, [loadMe])

  if (sessionPending || mePending) {
    return (
      <BaseLayout>
        <div className="flex min-h-80 items-center justify-center px-4 lg:px-6">
          <LoadingSpinner />
        </div>
      </BaseLayout>
    )
  }

  return (
    <BaseLayout>
      <div className="space-y-5 px-4 lg:px-6">
        <header className="space-y-1.5">
          <h1 className="text-3xl font-bold tracking-tight">Security</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">Manage how you sign in and protect your Arkivra account.</p>
        </header>

        {meError ? <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{meError}</div> : null}

        <div className="space-y-3">
          <TwoFactorSettingsRow
            isTwoFactorEnabled={isTwoFactorEnabled}
            verificationMethod={verificationMethod}
            refreshMe={() => void loadMe()}
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
            verificationMethod={verificationMethod}
            onPasswordEnabled={() => void loadMe()}
          />
          <ConnectedSignInSettingsRow hasPassword={hasPassword} oauthProviders={oauthProviders} onAuthMethodsChanged={() => void loadMe()} />
          <SettingsSessionsSection me={me} />
        </div>
      </div>
    </BaseLayout>
  )
}
