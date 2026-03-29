FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.30.3 --activate
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json ./apps/api/
RUN pnpm install --frozen-lockfile

# Build
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY . .
RUN pnpm --filter @arkivra/api build

# Production
FROM base AS production
RUN apk add --no-cache curl
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/drizzle ./apps/api/drizzle
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/src/scripts ./apps/api/src/scripts
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/pnpm-workspace.yaml ./pnpm-workspace.yaml

RUN mkdir -p /app/document-storage /app/backups

WORKDIR /app/apps/api

EXPOSE 1221

CMD ["sh", "-c", "pnpm db:migrate && pnpm start"]
