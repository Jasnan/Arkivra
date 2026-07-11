# Arkivra Website

Fresh Astro marketing site for Arkivra.

## Commands

- `pnpm --dir apps/website dev`
- `pnpm --dir apps/website build`
- `pnpm --dir apps/website check`

## Cloudflare Workers

- Build from the repository root with `pnpm --dir apps/website build`.
- Deploy from the repository root with `pnpm run deploy:website`.
- In Workers Builds, use those commands as the build and deploy commands respectively.
- Set `PUBLIC_SITE_URL=https://arkivra.app/` for production builds.
- Keep Cloudflare Web Analytics disabled unless the public privacy policy is updated to describe that collection.
