FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.30.3 --activate
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/arkivra-server/package.json ./apps/arkivra-server/
RUN pnpm install --frozen-lockfile

# Build
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/arkivra-server/node_modules ./apps/arkivra-server/node_modules
COPY package.json pnpm-workspace.yaml tsconfig.json ./
COPY apps/arkivra-server ./apps/arkivra-server
RUN pnpm --filter @arkivra/api build

# Production
FROM base AS production
RUN apk add --no-cache curl
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/arkivra-server/node_modules ./apps/arkivra-server/node_modules
COPY --from=build /app/apps/arkivra-server/dist ./apps/arkivra-server/dist
COPY --from=build /app/apps/arkivra-server/drizzle ./apps/arkivra-server/drizzle
COPY --from=build /app/apps/arkivra-server/package.json ./apps/arkivra-server/package.json
COPY --from=build /app/apps/arkivra-server/src/scripts ./apps/arkivra-server/src/scripts
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/pnpm-workspace.yaml ./pnpm-workspace.yaml

RUN mkdir -p /app/document-storage /app/upload-staging /app/backups

WORKDIR /app/apps/arkivra-server

EXPOSE 1221

CMD ["sh", "-c", "role=\"${ARKIVRA_PROCESS_ROLE:-all}\"; if [ \"$role\" = \"worker\" ]; then pnpm start; else pnpm db:migrate && pnpm start; fi"]
