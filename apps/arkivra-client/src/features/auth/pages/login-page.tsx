import type { FormEvent } from 'react';
import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Mail } from 'lucide-react';
import { ROUTES } from '@/app/routes';
import {
  AuthCard,
  AuthField,
  AuthFooter,
  AuthForm,
  AuthLink,
  AuthPasswordField,
  AuthPrimaryButton,
  AuthStatus,
  OAuthButtons,
} from '@/features/auth/auth-layout';
import { authClient } from '@/lib/auth-client';

export function LoginPage() {
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [oauthProvider, setOAuthProvider] = useState<'google' | 'github' | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);

    const { data, error } = await authClient.signIn.email({
      email,
      password,
      rememberMe: true,
      callbackURL: ROUTES.root,
    });

    setIsSubmitting(false);

    if (error) {
      setErrorMessage(error.message ?? 'Sign in failed.');
      return;
    }

    if (data && typeof data === 'object' && 'twoFactorRedirect' in data && data.twoFactorRedirect) {
      navigate({ to: ROUTES.twoFactorVerify });
      return;
    }

    navigate({ to: ROUTES.root });
  }

  async function handleOAuth(provider: 'google' | 'github') {
    setErrorMessage(null);
    setOAuthProvider(provider);
    const callbackURL = new URL(ROUTES.root, window.location.origin).toString();
    const { error } = await authClient.signIn.social({ provider, callbackURL });
    setOAuthProvider(null);
    if (error) setErrorMessage(error.message ?? 'OAuth sign in failed.');
  }

  return (
    <AuthCard title="Sign in">
      <AuthForm onSubmit={handleSubmit}>
        <AuthField
          id="email"
          label="Email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          icon={Mail}
          onChange={(event) => setEmail(event.target.value)}
        />

        <AuthPasswordField
          id="password"
          label="Password"
          required
          autoComplete="current-password"
          placeholder="Enter your password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />

        {errorMessage ? <AuthStatus tone="error">{errorMessage}</AuthStatus> : null}

        <AuthPrimaryButton loading={isSubmitting} loadingText="Signing in...">
          Sign in
        </AuthPrimaryButton>
      </AuthForm>

      <OAuthButtons
        disabled={isSubmitting}
        loadingProvider={oauthProvider}
        onGoogle={() => handleOAuth('google')}
        onGithub={() => handleOAuth('github')}
      />

      <AuthFooter>
        <AuthLink to={ROUTES.requestPasswordReset}>Forgot password?</AuthLink>
        <AuthLink to={ROUTES.register} withArrow>Create an account</AuthLink>
      </AuthFooter>
    </AuthCard>
  );
}
