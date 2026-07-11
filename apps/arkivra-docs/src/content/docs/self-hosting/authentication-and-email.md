---
title: Authentication and email
description: Bootstrap the first administrator and configure registration, SMTP, OAuth, and two-factor authentication.
---

Arkivra supports email-and-password accounts, optional Google and GitHub OAuth, email invitations, password resets, and TOTP two-factor authentication. Configure the public origin and email delivery before inviting production users.

## Bootstrap the first administrator

When there is no active administrator, Arkivra promotes the oldest registered user the next time that user reaches an authenticated API route.

1. Start the new instance.
2. Register the first account.
3. Sign in and load the dashboard.
4. Confirm the **Administration** section appears in the sidebar.

After an active administrator exists, later registrations create regular members. Arkivra also prevents removal of the last active platform administrator.

:::caution
Do not expose a new instance with open registration and wait to create the administrator. Register the intended administrator before making the service public, or disable public access until bootstrap is complete.
:::

## Control registration and email verification

Open registration is enabled by default:

```dotenv
ARKIVRA_AUTH_REGISTRATION_ENABLED=true
```

Set it to `false` to require invitations once the instance has users. Email verification is optional:

```dotenv
ARKIVRA_AUTH_EMAIL_VERIFICATION_REQUIRED=false
```

If you set verification to `true`, configure working SMTP first. Without SMTP, Arkivra writes auth emails to API logs; that behavior is suitable only for local development.

## Configure SMTP

Use `smtp://` for STARTTLS-capable submission or `smtps://` for implicit TLS:

```dotenv
ARKIVRA_SMTP_URL=smtp://user:password@smtp.example.com:587?starttls=true
ARKIVRA_EMAIL_FROM=noreply@example.com
ARKIVRA_EMAIL_FROM_NAME=Arkivra
```

Restart Arkivra after changing environment variables, then test an invitation or password-reset email. Credentials in an SMTP URL should be URL-encoded when they contain reserved characters.

## Configure OAuth

OAuth is optional. Arkivra exposes a provider only when its client ID and secret are configured.

For Google:

```dotenv
GOOGLE_CLIENT_ID=<client-id>
GOOGLE_CLIENT_SECRET=<client-secret>
```

For GitHub:

```dotenv
GITHUB_CLIENT_ID=<client-id>
GITHUB_CLIENT_SECRET=<client-secret>
```

For a normal single-origin deployment, callbacks are derived from `ARKIVRA_PUBLIC_URL`:

```text
https://documents.example.com/api/auth/callback/google
https://documents.example.com/api/auth/callback/github
```

Register the exact applicable URL with the provider. Use `GOOGLE_REDIRECT_URI`, `GITHUB_REDIRECT_URI`, or `BETTER_AUTH_URL` only when an advanced split-origin deployment cannot use the derived callback.

## Two-factor authentication

Users manage TOTP two-factor authentication from **Settings** → **Security**. Enabling it requires the user's password, an authenticator app, and confirmation of a generated TOTP code. Arkivra then provides backup codes that the user should store outside the instance.

Users who signed up through OAuth may need to set a password before enabling password-protected security actions. Administrators do not receive or manage a user's TOTP secret or backup codes through the user-management page.

## Invitations and account administration

Platform administrators can invite accounts and assign a platform role and capabilities. Vault owners can add existing users directly or request an email invitation to a vault, depending on the recipient and requested role. Some vault operations enter the administrator approval queue; see [Users and permissions](/administration/users-and-permissions/).

## Troubleshoot redirects and delivery

- If an OAuth provider reports a callback mismatch, compare its registered callback with the URL derived from `ARKIVRA_PUBLIC_URL`.
- If Arkivra rejects the browser origin, confirm the public URL and reverse-proxy scheme. Use trusted-origin overrides only for a deliberate multi-origin deployment.
- If mail does not arrive, inspect API logs for SMTP connection or TLS errors and confirm the sender is accepted by the mail service.
- If verification is required and SMTP is unavailable, restore mail delivery rather than changing account rows manually.
