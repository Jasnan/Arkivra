"use client"

import { useEffect, useMemo, useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { Check, Mail } from "lucide-react"
import { useForm } from "react-hook-form"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import { z } from "zod"

import { Logo } from "@/components/logo"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import {
  acceptPlatformAccountInvitation,
  getPlatformAccountInvitationDetails,
  type AcceptInvitationDetails,
} from "@/app/admin/users/admin-users.api"
import { formatDate as formatPreferredDate } from "@/lib/date-format"

const acceptInviteSchema = z.object({
  name: z.string().min(1, "Name is required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string().min(8, "Please confirm your password"),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
})

type AcceptInviteFormValues = z.infer<typeof acceptInviteSchema>

function formatDate(value: string | null | undefined) {
  return formatPreferredDate(value, { dateStyle: "medium", timeStyle: "short" }, value ? "Unknown expiry" : "No expiry")
}

export default function AcceptInvitePage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = useMemo(() => searchParams.get("token")?.trim() ?? "", [searchParams])
  const [invitation, setInvitation] = useState<AcceptInvitationDetails | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const form = useForm<AcceptInviteFormValues>({
    resolver: zodResolver(acceptInviteSchema),
    defaultValues: {
      name: "",
      password: "",
      confirmPassword: "",
    },
  })

  useEffect(() => {
    let cancelled = false

    async function loadInvitation() {
      setIsLoading(true)
      setErrorMessage(null)

      if (!token) {
        setInvitation(null)
        setErrorMessage("Invitation link is missing a token.")
        setIsLoading(false)
        return
      }

      try {
        const result = await getPlatformAccountInvitationDetails({ token })
        if (!cancelled) {
          setInvitation(result.invitation)
        }
      } catch (error) {
        if (!cancelled) {
          setInvitation(null)
          setErrorMessage(error instanceof Error ? error.message : "Invitation not found or expired.")
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    void loadInvitation()

    return () => {
      cancelled = true
    }
  }, [token])

  async function onSubmit(data: AcceptInviteFormValues) {
    if (!token) return

    setErrorMessage(null)
    setIsSubmitting(true)

    try {
      await acceptPlatformAccountInvitation({
        token,
        name: data.name,
        password: data.password,
      })
      navigate("/login", {
        replace: true,
        state: {
          message: "Your account is ready. Sign in with your new password.",
        },
      })
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not accept invitation.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="bg-muted flex min-h-svh flex-col items-center justify-center gap-6 p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <Link to="/" className="flex items-center gap-2 self-center font-medium">
          <div className="bg-primary text-primary-foreground flex size-9 items-center justify-center rounded-md">
            <Logo size={24} />
          </div>
          Arkivra
        </Link>

        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-xl">Accept invitation</CardTitle>
            <CardDescription>Set your password to create your Arkivra account.</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="rounded-md border p-4 text-sm text-muted-foreground">Loading invitation...</div>
            ) : invitation ? (
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-5">
                  <div className="rounded-md border bg-muted/30 p-3">
                    <div className="flex items-start gap-3">
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <Mail className="size-5" />
                      </div>
                      <div className="min-w-0 space-y-1 text-sm">
                        <p className="break-all font-medium">{invitation.email}</p>
                        <p className="text-muted-foreground">
                          Role: {invitation.systemRole === "admin" ? "Administrator" : "Member"}
                        </p>
                        <p className="text-muted-foreground">Expires: {formatDate(invitation.expiresAt)}</p>
                      </div>
                    </div>
                  </div>

                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Jane Doe" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Password</FormLabel>
                        <FormControl>
                          <Input type="password" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="confirmPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Confirm password</FormLabel>
                        <FormControl>
                          <Input type="password" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {errorMessage ? (
                    <p className="text-sm text-destructive">{errorMessage}</p>
                  ) : null}

                  <Button type="submit" className="w-full cursor-pointer" disabled={isSubmitting}>
                    <Check className="mr-2 size-4" />
                    {isSubmitting ? "Creating account..." : "Create account"}
                  </Button>
                </form>
              </Form>
            ) : (
              <div className="grid gap-4">
                <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
                  {errorMessage ?? "Invitation not found or expired."}
                </div>
                <Button asChild variant="outline">
                  <Link to="/login">Back to sign in</Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
