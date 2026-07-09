"use client"

import { useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { CircleCheck, MailCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { authClient } from "@/lib/auth-client"

export function EmailVerificationCard() {
  const [searchParams] = useSearchParams()
  const email = searchParams.get("email") ?? ""
  const [isSending, setIsSending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  async function handleResend() {
    if (!email) return

    setIsSending(true)
    setMessage(null)
    setErrorMessage(null)

    const callbackURL = new URL("/", window.location.origin).toString()
    const { error } = await authClient.sendVerificationEmail({ email, callbackURL })

    setIsSending(false)

    if (error) {
      setErrorMessage(error.message ?? "Could not send verification email.")
      return
    }

    setMessage("A fresh verification email is on its way.")
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <div className="bg-primary/10 text-primary mx-auto flex size-10 items-center justify-center rounded-full">
          <MailCheck className="size-5" />
        </div>
        <CardTitle className="text-xl">Verify your email</CardTitle>
        <CardDescription>
          Confirm your address to finish setting up Arkivra.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="bg-muted text-muted-foreground rounded-md px-3 py-2 text-sm">
          {email
            ? `We sent a verification link to ${email}. Open it to activate your account.`
            : "Open the verification link from your inbox to activate your account."}
        </div>

        {message ? (
          <div className="text-muted-foreground flex items-center gap-2 text-sm">
            <CircleCheck className="size-4" />
            <span>{message}</span>
          </div>
        ) : null}

        {errorMessage ? (
          <p className="text-destructive text-sm">{errorMessage}</p>
        ) : null}

        {email ? (
          <Button type="button" onClick={handleResend} disabled={isSending}>
            {isSending ? "Sending..." : "Resend email"}
          </Button>
        ) : null}
      </CardContent>
      <CardFooter className="justify-center">
        <Link to="/login" className="text-sm underline underline-offset-4">
          Back to sign in
        </Link>
      </CardFooter>
    </Card>
  )
}
