import { RequestPasswordResetForm } from "./components/request-password-reset-form"
import { Logo } from "@/components/logo"

export default function RequestPasswordResetPage() {
  return (
    <div className="bg-muted flex min-h-svh flex-col items-center justify-center gap-6 p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <a href="/" className="flex items-center gap-2 self-center font-medium">
          <div className="bg-primary text-primary-foreground flex size-9 items-center justify-center rounded-md">
            <Logo size={24} />
          </div>
          Arkivra
        </a>
        <RequestPasswordResetForm />
      </div>
    </div>
  )
}
