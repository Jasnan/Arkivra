# syntax=docker/dockerfile:1.7

ARG NODE_IMAGE=node:22-alpine@sha256:16e22a550f3863206a3f701448c45f7912c6896a62de43add43bb9c86130c3e2

# Compile architecture-independent application assets on the native builder
# platform. Target-specific native production dependencies are installed later.
FROM --platform=$BUILDPLATFORM ${NODE_IMAGE} AS build-base
RUN corepack enable && corepack prepare pnpm@10.30.3 --activate
WORKDIR /app

# Install dependencies
FROM build-base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/arkivra-server/package.json ./apps/arkivra-server/
COPY apps/arkivra-client/package.json ./apps/arkivra-client/
RUN pnpm install --frozen-lockfile

FROM ${NODE_IMAGE} AS prod-deps
RUN corepack enable && corepack prepare pnpm@10.30.3 --activate
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/arkivra-server/package.json ./apps/arkivra-server/
RUN pnpm install --prod --frozen-lockfile

# Build
FROM build-base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/arkivra-server/node_modules ./apps/arkivra-server/node_modules
COPY --from=deps /app/apps/arkivra-client/node_modules ./apps/arkivra-client/node_modules
COPY package.json pnpm-workspace.yaml tsconfig.json ./
COPY apps/arkivra-server ./apps/arkivra-server
COPY apps/arkivra-client ./apps/arkivra-client
RUN pnpm --dir apps/arkivra-server build
RUN pnpm --dir apps/arkivra-client build

# Production
FROM ${NODE_IMAGE} AS production
ARG ARKIVRA_VERSION=dev

RUN apk add --no-cache curl tini \
  && addgroup -S -g 10001 arkivra \
  && adduser -S -D -H -u 10001 -G arkivra arkivra

WORKDIR /app

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/apps/arkivra-server/node_modules ./apps/arkivra-server/node_modules
COPY --from=build /app/apps/arkivra-server/dist ./apps/arkivra-server/dist
COPY --from=build /app/apps/arkivra-server/drizzle ./apps/arkivra-server/drizzle
COPY --from=build /app/apps/arkivra-server/package.json ./apps/arkivra-server/package.json
COPY --from=build /app/apps/arkivra-client/dist ./apps/arkivra-server/public
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --chmod=755 apps/arkivra-server/docker-entrypoint.sh /usr/local/bin/arkivra-entrypoint

RUN mkdir -p /app/data /home/arkivra \
  && chown -R arkivra:arkivra /app/data /home/arkivra

ENV NODE_ENV=production \
  ARKIVRA_VERSION=${ARKIVRA_VERSION} \
  ARKIVRA_PROCESS_ROLE=all \
  ARKIVRA_PORT=3210 \
  ARKIVRA_HOSTNAME=0.0.0.0 \
  ARKIVRA_DATA_PATH=/app/data \
  HOME=/home/arkivra

WORKDIR /app/apps/arkivra-server

EXPOSE 3210

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl --fail --silent --show-error "http://127.0.0.1:${ARKIVRA_PORT}/api/health" || exit 1

USER arkivra

ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/arkivra-entrypoint"]
