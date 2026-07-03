"use client"

import * as React from "react"
import { LockKeyhole, Pencil, Trash2, Upload } from "lucide-react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"

import { BaseLayout } from "@/components/layouts/base-layout"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { LoadingSpinner } from "@/components/ui/loading-spinner"
import { fetchJson } from "@/lib/api"
import { authClient } from "@/lib/auth-client"
import { cn } from "@/lib/utils"

interface MeResponse {
  userId: string
  sessionId: string
  systemRole: "admin" | "member" | null
  systemCapabilities: string[]
  isAdmin: boolean
  canCreateVault: boolean
  aiFeaturesEnabled: boolean
  authMethods: {
    hasPassword: boolean
    oauthProviders: string[]
    primaryOAuthProvider: string | null
  }
}

interface SessionUserMetadata {
  name?: string | null
  email?: string | null
  emailVerified?: boolean | null
  createdAt?: string | Date | null
  image?: string | null
}

const userFormSchema = z.object({
  firstName: z.string(),
  lastName: z.string(),
  email: z.string().email("Invalid email address").or(z.literal("")),
})

type UserFormValues = z.infer<typeof userFormSchema>

type StatusTone = "verified" | "enabled" | "warning" | "inactive"

const avatarMaxSizeBytes = 800 * 1024
const allowedAvatarTypes = new Set(["image/jpeg", "image/gif", "image/png"])

const statusToneClasses: Record<StatusTone, string> = {
  verified: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-300",
  enabled: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-300",
  warning: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-300",
  inactive: "border-border bg-muted text-muted-foreground",
}

function getProviderLabel(provider: string) {
  const labels: Record<string, string> = {
    credential: "Local",
    github: "GitHub",
    google: "Google",
  }

  return labels[provider.toLowerCase()] ?? provider
}

function getAccountTypeLabel(authMethods: MeResponse["authMethods"] | undefined) {
  if (!authMethods) return "Not available"

  const providers = authMethods.oauthProviders.map(getProviderLabel)

  if (authMethods.hasPassword && providers.length > 0) {
    return `Local + ${providers.join(", ")}`
  }

  if (authMethods.hasPassword) {
    return "Local account"
  }

  if (providers.length > 0) {
    return `${providers.join(", ")} OAuth`
  }

  return "Unknown"
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

function splitDisplayName(name: string) {
  const trimmed = name.trim()
  if (!trimmed) {
    return { firstName: "", lastName: "" }
  }

  const [firstName, ...lastNameParts] = trimmed.split(/\s+/)
  return {
    firstName: firstName ?? "",
    lastName: lastNameParts.join(" "),
  }
}

function buildDisplayName(values: Pick<UserFormValues, "firstName" | "lastName">) {
  return [values.firstName.trim(), values.lastName.trim()].filter(Boolean).join(" ")
}

function getInitials(name: string, email: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)

  if (parts.length > 0) {
    return parts
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("")
  }

  return email[0]?.toUpperCase() ?? "A"
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result)
        return
      }

      reject(new Error("Could not read profile photo."))
    }
    reader.onerror = () => reject(new Error("Could not read profile photo."))
    reader.readAsDataURL(file)
  })
}

function StatusBadge({ children, tone }: { children: React.ReactNode; tone: StatusTone }) {
  return (
    <Badge variant="outline" className={cn("font-medium", statusToneClasses[tone])}>
      {children}
    </Badge>
  )
}

function AccountDetailRows({ children }: { children: React.ReactNode }) {
  return <div className="divide-y rounded-md border">{children}</div>
}

function SettingsThemeSection({
  actions,
  children,
  description,
  title,
}: {
  actions?: React.ReactNode
  children: React.ReactNode
  description: string
  title: string
}) {
  return (
    <section className="min-w-0 space-y-6">
      <div className="flex flex-col gap-4 border-b pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1.5">
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        {actions ? <div className="flex shrink-0 gap-2">{actions}</div> : null}
      </div>
      {children}
    </section>
  )
}

function AccountDetailRow({
  label,
  note,
  value,
}: {
  label: string
  note?: React.ReactNode
  value: React.ReactNode
}) {
  return (
    <div className="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(10rem,14rem)_minmax(0,1fr)] sm:items-start sm:gap-4">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="min-w-0 space-y-1 sm:text-right">
        <div className="min-w-0 text-sm font-medium text-foreground">{value}</div>
        {note ? <div className="text-xs text-muted-foreground">{note}</div> : null}
      </div>
    </div>
  )
}

async function getMe(signal?: AbortSignal) {
  return fetchJson<MeResponse>("/api/me", { signal })
}

export default function UserSettingsPage() {
  const { data: sessionData, isPending: sessionPending } = authClient.useSession()
  const [me, setMe] = React.useState<MeResponse | null>(null)
  const [meError, setMeError] = React.useState<string | null>(null)
  const [mePending, setMePending] = React.useState(true)
  const [profileDraft, setProfileDraft] = React.useState<{ name: string; image?: string | null } | null>(null)
  const [avatarDraft, setAvatarDraft] = React.useState<string | null | undefined>(undefined)
  const [isEditingProfile, setIsEditingProfile] = React.useState(false)
  const [isSavingName, setIsSavingName] = React.useState(false)
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const sessionUser = sessionData?.user as SessionUserMetadata | undefined
  const profileName = profileDraft?.name ?? sessionUser?.name ?? ""
  const profileEmail = sessionUser?.email ?? ""
  const profileImage = avatarDraft === undefined ? profileDraft?.image ?? sessionUser?.image ?? null : avatarDraft
  const isEmailVerified = sessionUser?.emailVerified === true
  const accountCreatedAt = sessionUser?.createdAt
  const initials = getInitials(profileName, profileEmail)
  const nameParts = React.useMemo(() => splitDisplayName(profileName), [profileName])
  const form = useForm<UserFormValues>({
    resolver: zodResolver(userFormSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
    },
  })

  React.useEffect(() => {
    const controller = new AbortController()

    setMePending(true)
    getMe(controller.signal)
      .then((data) => {
        setMe(data)
        setMeError(null)
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setMeError(error instanceof Error ? error.message : "Could not load account details.")
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setMePending(false)
        }
      })

    return () => controller.abort()
  }, [])

  React.useEffect(() => {
    if (isEditingProfile) return

    form.reset({
      firstName: nameParts.firstName,
      lastName: nameParts.lastName,
      email: profileEmail,
    })
  }, [form, isEditingProfile, nameParts.firstName, nameParts.lastName, profileEmail])

  async function handleSaveProfile(values: UserFormValues) {
    const nextName = buildDisplayName(values)
    setIsSavingName(true)

    try {
      const { error } = await authClient.updateUser({
        name: nextName || undefined,
        image: avatarDraft === undefined ? undefined : avatarDraft,
      })

      if (error) {
        throw new Error(error.message ?? "Could not update your profile.")
      }

      setProfileDraft({ name: nextName, image: avatarDraft === undefined ? profileImage : avatarDraft })
      setAvatarDraft(undefined)
      form.reset({
        firstName: splitDisplayName(nextName).firstName,
        lastName: splitDisplayName(nextName).lastName,
        email: profileEmail,
      })
      setIsEditingProfile(false)
      toast.success("Profile updated.")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update your profile.")
    } finally {
      setIsSavingName(false)
    }
  }

  async function handleAvatarFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ""

    if (!file) return

    if (!allowedAvatarTypes.has(file.type)) {
      toast.error("Choose a JPG, GIF, or PNG profile photo.")
      return
    }

    if (file.size > avatarMaxSizeBytes) {
      toast.error("Profile photo must be 800 KB or smaller.")
      return
    }

    try {
      setAvatarDraft(await readFileAsDataUrl(file))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not read profile photo.")
    }
  }

  const isLoading = sessionPending || mePending

  return (
    <BaseLayout title="User Settings" description="View and manage your profile and account details.">
      <div className="px-4 lg:px-6">
        {isLoading ? (
          <div className="max-w-4xl">
            <LoadingSpinner />
          </div>
        ) : (
          <div className="flex max-w-4xl flex-col gap-8">
            <Form {...form}>
              <form className="min-w-0" onSubmit={form.handleSubmit(handleSaveProfile)}>
                <SettingsThemeSection
                  title="Profile settings"
                  description="Update the name shown on your Arkivra account."
                  actions={
                    isEditingProfile ? (
                      <>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            form.reset({
                              firstName: nameParts.firstName,
                              lastName: nameParts.lastName,
                              email: profileEmail,
                            })
                            setAvatarDraft(undefined)
                            setIsEditingProfile(false)
                          }}
                          disabled={isSavingName}
                        >
                          Cancel
                        </Button>
                        <Button type="submit" disabled={isSavingName}>
                          {isSavingName ? "Saving..." : "Save"}
                        </Button>
                      </>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setIsEditingProfile(true)}
                      >
                        <Pencil className="size-4" />
                        Edit
                      </Button>
                    )
                  }
                >
                  <div className="space-y-6">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                      <Avatar className="size-20 rounded-lg">
                        <AvatarImage src={profileImage ?? undefined} alt={profileName || profileEmail || "Profile photo"} />
                        <AvatarFallback className="rounded-lg text-lg font-semibold">
                          {initials}
                        </AvatarFallback>
                      </Avatar>
                      <div className="space-y-3">
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            disabled={!isEditingProfile || isSavingName}
                            onClick={() => fileInputRef.current?.click()}
                          >
                            <Upload className="size-4" />
                            Upload new photo
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={!isEditingProfile || isSavingName || profileImage === null}
                            onClick={() => setAvatarDraft(null)}
                          >
                            <Trash2 className="size-4" />
                            Remove
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Allowed JPG, GIF, or PNG. Max size of 800 KB.
                        </p>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/jpeg,image/gif,image/png"
                          className="hidden"
                          onChange={handleAvatarFileChange}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                      <FormField
                        control={form.control}
                        name="firstName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>First Name</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="Enter your first name"
                                disabled={!isEditingProfile || isSavingName}
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="lastName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Last Name</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="Enter your last name"
                                disabled={!isEditingProfile || isSavingName}
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="email"
                        render={({ field }) => (
                          <FormItem className="md:col-span-2">
                            <FormLabel>E-mail</FormLabel>
                            <FormControl>
                              <Input
                                type="email"
                                placeholder="No email available"
                                disabled
                                {...field}
                              />
                            </FormControl>
                            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <LockKeyhole className="size-3" />
                              Email changes are managed by your account provider.
                            </p>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                </SettingsThemeSection>
              </form>
            </Form>

            <SettingsThemeSection
              title="Account details"
              description="Review your account, role, and sign-in details."
            >
              <div className="space-y-4">
                {meError ? (
                  <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                    {meError}
                  </div>
                ) : null}

                <AccountDetailRows>
                  <AccountDetailRow label="Signed in as" value={profileEmail || "Unknown"} />
                  <AccountDetailRow
                    label="Account type"
                    value={getAccountTypeLabel(me?.authMethods)}
                  />
                  <AccountDetailRow
                    label="System role"
                    value={
                      <StatusBadge tone={me?.isAdmin ? "enabled" : "inactive"}>
                        {me?.isAdmin ? "Admin" : "Member"}
                      </StatusBadge>
                    }
                  />
                  <AccountDetailRow
                    label="Vault creation"
                    value={me?.canCreateVault ? "Allowed" : "Requires admin approval"}
                  />
                  <AccountDetailRow
                    label="Email verification"
                    value={
                      <StatusBadge tone={isEmailVerified ? "verified" : "warning"}>
                        {isEmailVerified ? "Verified" : "Unverified"}
                      </StatusBadge>
                    }
                  />
                  <AccountDetailRow
                    label="Account created"
                    value={formatShortDateTime(accountCreatedAt)}
                  />
                </AccountDetailRows>
              </div>
            </SettingsThemeSection>
          </div>
        )}
      </div>
    </BaseLayout>
  )
}
