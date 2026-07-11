# Arkivra Website

Fresh Astro marketing site for Arkivra.

## Commands

- `pnpm --dir apps/website dev`
- `pnpm --dir apps/website build`
- `pnpm --dir apps/website check`

## Cloudflare Pages

- Build from the repository root with `pnpm --dir apps/website build`.
- Publish `apps/website/dist`.
- Set `PUBLIC_SITE_URL=https://arkivra.app/` for production builds.
- Keep Cloudflare Web Analytics disabled unless the public privacy policy is updated to describe that collection.
