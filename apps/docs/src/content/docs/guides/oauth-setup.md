---
title: OAuth Setup
description: Configure optional Google and GitHub OAuth sign-in.
---

Google and GitHub OAuth are optional. Configure a provider only when you want that sign-in method enabled.

## Google

Set:

```dotenv
GOOGLE_CLIENT_ID=<client-id>
GOOGLE_CLIENT_SECRET=<client-secret>
```

For local development, the default callback is:

```text
http://localhost:5173/api/auth/callback/google
```

## GitHub

Set:

```dotenv
GITHUB_CLIENT_ID=<client-id>
GITHUB_CLIENT_SECRET=<client-secret>
```

For local development, the default callback is:

```text
http://localhost:5173/api/auth/callback/github
```

For production, the callback origin is derived from `ARKIVRA_PUBLIC_URL`, for example `https://app.example.com/api/auth/callback/google`. Use `GOOGLE_REDIRECT_URI`, `GITHUB_REDIRECT_URI`, or `BETTER_AUTH_URL` only for split-origin deployments that cannot use the public URL default.
