# syntax=docker/dockerfile:1
#
# Production image for the API. Build from the repo root so the workspace packages are in context:
#
#   docker build -f apps/api/Dockerfile -t predict-api --build-arg APP_VERSION=$(git rev-parse --short HEAD) .
#
# The same image runs migrations, seeds and staff accounts (see docs/RUNBOOK.md):
#
#   docker run --rm --env-file .env predict-api node dist/scripts/migrate.js

ARG NODE_VERSION=22

FROM node:${NODE_VERSION}-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /repo

FROM base AS build
# Download every locked package first, so this layer is reused until the lockfile changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm fetch --frozen-lockfile

COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --offline --filter "@predict/api..."
# Builds the shared packages before the API (pnpm runs them in dependency order).
RUN pnpm --filter "@predict/api..." run build
# A standalone copy of the API at the locked versions: production dependencies only, workspace
# packages copied in with their published files (dist, plus brand fonts and db migrations).
# Injecting is for this step only; in development the packages stay symlinked for the watchers.
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm --filter @predict/api deploy --prod --offline \
      --config.inject-workspace-packages=true /out

FROM node:${NODE_VERSION}-bookworm-slim AS runtime
ARG APP_VERSION=0.0.0
ENV NODE_ENV=production \
    PORT=4000 \
    APP_VERSION=${APP_VERSION}
WORKDIR /app
COPY --from=build --chown=node:node /out ./
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + process.env.PORT + '/v1/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "dist/main.js"]
