import { useState } from 'react';
import { useSearch } from '@tanstack/react-router';
import { CircleCheck, MailCheck } from 'lucide-react';
import { ROUTES } from '@/app/routes';
import {
  AuthActions,
  AuthCard,
  AuthLink,
  AuthPrimaryButton,
  AuthStatus,
} from '@/features/auth/auth-layout';
import { authClient } from '@/lib/auth-client';

export function EmailVerificationPage() {
  const search = useSearch({ strict: false });
  const email = (search as Record<string, string | undefined>).email;
  const [isSending, setIsSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleResend() {
    if (!email) return;

    setIsSending(true);
    setMessage(null);
    setErrorMessage(null);

    const callbackURL = new URL(ROUTES.root, window.location.origin).toString();
    const { error } = await authClient.sendVerificationEmail({ email, callbackURL });

    setIsSending(false);

    if (error) {
      setErrorMessage(error.message ?? 'Could not send verification email.');
      return;
    }

    setMessage('A fresh verification email is on its way.');
  }

  return (
    <AuthCard title="Verify your email" subtitle="Confirm your address to finish setting up Arkivra.">
      <AuthStatus tone="info" icon={MailCheck} title="Check your inbox">
        {email
          ? `We sent a verification link to ${email}. Open it to activate your account.`
          : 'Open the verification link from your inbox to activate your account.'}
      </AuthStatus>

      {message ? (
        <AuthStatus tone="success" icon={CircleCheck}>{message}</AuthStatus>
      ) : null}

      {errorMessage ? <AuthStatus tone="error">{errorMessage}</AuthStatus> : null}

      {email ? (
        <AuthPrimaryButton type="button" loading={isSending} loadingText="Sending..." onClick={handleResend}>
          Resend email
        </AuthPrimaryButton>
      ) : null}

      <AuthActions>
        <AuthLink to={ROUTES.login}>Back to sign in</AuthLink>
      </AuthActions>
    </AuthCard>
  );
}
