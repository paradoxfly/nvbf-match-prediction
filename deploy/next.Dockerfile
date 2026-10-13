# syntax=docker/dockerfile:1
# Builds one of the Next apps (web or admin) as a standalone server. Build from the repo root:
#   docker build -f deploy/next.Dockerfile --build-arg APP=web -t predict-web .
ARG NODE_VERSION=22

FROM node:${NODE_VERSION}-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /repo

FROM base AS build
ARG APP=web
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm fetch --frozen-lockfile
COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --offline --filter "@predict/${APP}..."
# Public values are baked into the client bundle at build time, and the /api rewrite target
# into the server's routes, so these are build arguments.
ARG API_ORIGIN=http://api:4000
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY
ARG NEXT_PUBLIC_SENTRY_DSN
ENV API_ORIGIN=$API_ORIGIN \
    NEXT_OUTPUT=standalone \
    NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_PUBLIC_TURNSTILE_SITE_KEY=$NEXT_PUBLIC_TURNSTILE_SITE_KEY \
    NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN \
    NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter "@predict/${APP}..." run build

FROM node:${NODE_VERSION}-bookworm-slim AS runtime
ARG APP=web
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    APP=${APP}
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/${APP}/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/${APP}/.next/static ./apps/${APP}/.next/static
COPY --from=build --chown=node:node /repo/apps/${APP}/public ./apps/${APP}/public
USER node
# PORT is set per service (web 3000, admin 3001) in the compose file.
CMD ["sh", "-c", "node apps/$APP/server.js"]
