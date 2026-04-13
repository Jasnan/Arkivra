import type { FormEvent } from 'react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { AuthCard, AuthLayout } from '@/features/auth/auth-layout';
import { authClient } from '@/lib/auth-client';

const inputClassName = 'h-10 w-full rounded-xl border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

export function LoginPage() {
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);

    const { data, error } = await authClient.signIn.email({
      email,
      password,
      rememberMe: true,
      callbackURL: '/',
    });

    setIsSubmitting(false);

    if (error) {
      setErrorMessage(error.message ?? 'Sign in failed.');
      return;
    }

    if (data && typeof data === 'object' && 'twoFactorRedirect' in data && data.twoFactorRedirect) {
      navigate('/two-factor/verify');
      return;
    }

    navigate('/');
  }

  async function handleOAuth(provider: 'google' | 'github') {
    setErrorMessage(null);
    const { error } = await authClient.signIn.social({ provider, callbackURL: '/' });

    if (error) {
      setErrorMessage(error.message ?? 'OAuth sign in failed.');
    }
  }

  return (
    <AuthLayout>
      <AuthCard title="Welcome back" subtitle="Sign in to access your vaults.">
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-1.5">
            <label htmlFor="email" className="text-sm font-medium">Email</label>
            <input id="email" type="email" required autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} className={inputClassName} />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="password" className="text-sm font-medium">Password</label>
            <input id="password" type="password" required autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} className={inputClassName} />
          </div>

          {errorMessage ? <p className="text-sm text-destructive">{errorMessage}</p> : null}

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>

        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="outline" onClick={() => handleOAuth('google')}>Google</Button>
          <Button type="button" variant="outline" onClick={() => handleOAuth('github')}>GitHub</Button>
        </div>

        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <Link to="/request-password-reset" className="hover:text-foreground">Forgot password?</Link>
          <Link to="/register" className="hover:text-foreground">Create account</Link>
        </div>
      </AuthCard>
    </AuthLayout>
  );
}
