FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.30.3 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/arkivra-client/package.json ./apps/arkivra-client/
RUN pnpm --dir apps/arkivra-client install --frozen-lockfile

FROM deps AS development
COPY package.json pnpm-workspace.yaml tsconfig.json ./
COPY apps/arkivra-client ./apps/arkivra-client
WORKDIR /app/apps/arkivra-client

EXPOSE 5173

CMD ["pnpm", "dev", "--host", "0.0.0.0"]
