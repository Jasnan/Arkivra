"use client"

import { useState, type FormEvent } from "react"
import { Link } from "react-router-dom"
import { CircleCheck } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { authClient } from "@/lib/auth-client"

export function RequestPasswordResetForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const [email, setEmail] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorMessage(null)
    setIsSubmitting(true)

    const redirectTo = `${window.location.origin}/reset-password`
    const { error } = await authClient.requestPasswordReset({ email, redirectTo })

    setIsSubmitting(false)

    if (error) {
      setErrorMessage(error.message ?? "Unable to request reset link.")
      return
    }

    setSubmitted(true)
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Reset password</CardTitle>
          <CardDescription>
            Request a password reset link by email.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {submitted ? (
            <div className="grid gap-6">
              <div className="bg-muted text-muted-foreground flex gap-3 rounded-md px-3 py-2 text-sm">
                <CircleCheck className="mt-0.5 size-4 shrink-0" />
                <span>If an account exists for {email}, a reset link has been sent.</span>
              </div>
              <div className="text-center text-sm">
                <Link to="/login" className="underline underline-offset-4">
                  Sign in
                </Link>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <div className="grid gap-6">
                <div className="grid gap-6">
                  <div className="grid gap-3">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      autoComplete="email"
                      placeholder="you@example.com"
                      required
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                    />
                  </div>
                  {errorMessage ? (
                    <p className="text-destructive text-sm">{errorMessage}</p>
                  ) : null}
                  <Button type="submit" className="w-full cursor-pointer" disabled={isSubmitting}>
                    {isSubmitting ? "Sending reset link..." : "Send link"}
                  </Button>
                </div>
                <div className="text-center text-sm">
                  Remember your password?{" "}
                  <Link to="/login" className="underline underline-offset-4">
                    Sign in
                  </Link>
                </div>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
