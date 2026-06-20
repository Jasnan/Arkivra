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
GOOGLE_REDIRECT_URI=https://api.example.com/api/auth/callback/google
```

For local development, the default callback is:

```text
http://localhost:1221/api/auth/callback/google
```

## GitHub

Set:

```dotenv
GITHUB_CLIENT_ID=<client-id>
GITHUB_CLIENT_SECRET=<client-secret>
GITHUB_REDIRECT_URI=https://api.example.com/api/auth/callback/github
```

For local development, the default callback is:

```text
http://localhost:1221/api/auth/callback/github
```

For production, the callback origin must match `BETTER_AUTH_URL`.
