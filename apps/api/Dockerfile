# syntax=docker/dockerfile:1
#
# API (NestJS). Build from the repo root so the workspace packages are in the context:
#
#   docker build -f apps/api/Dockerfile -t predict-api .
#
# On start the container applies pending database migrations, then serves on $PORT (4000).
# Uploaded logos are kept in /data/uploads: mount a volume there so they survive redeploys.
# One-off commands run in the same container (e.g. from Dokploy's "Open Terminal"):
#
#   node dist/scripts/create-admin.js --email you@scoutgram.africa --name "You" --role super_admin
#   node dist/scripts/migrate.js
#
# See docs/DEPLOY.md.

ARG NODE_IMAGE=node:22.23.2-alpine3.24

# Node plus the pnpm version pinned in package.json ("packageManager"), through Corepack.
FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    TURBO_TELEMETRY_DISABLED=1 \
    DO_NOT_TRACK=1
WORKDIR /repo
COPY package.json ./
RUN corepack enable && corepack install

# Keep only the API and the workspace packages it uses, with a lockfile trimmed to match.
FROM base AS prune
COPY pnpm-workspace.yaml ./
# turbo at the version in the workspace catalog.
RUN npm install --global --no-fund --no-audit \
      "turbo@$(sed -n 's/^ *turbo: *//p' pnpm-workspace.yaml)"
COPY . .
RUN turbo prune @predict/api --docker

FROM base AS build
# Dependencies first, so this layer is reused until a package.json or the lockfile changes.
COPY --from=prune /repo/out/json/ ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --store-dir=/pnpm/store
COPY --from=prune /repo/out/full/ ./
# Builds the shared packages, then the API (pnpm runs them in dependency order).
RUN pnpm --filter "@predict/api..." run build
# A self-contained copy of the API: production dependencies only, with the workspace packages
# copied in with their published files (dist, and the db package's migrations folder).
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm --filter @predict/api deploy --prod --offline --store-dir=/pnpm/store \
      --config.inject-workspace-packages=true /out

FROM ${NODE_IMAGE} AS runtime
ARG APP_VERSION=0.0.0
ENV NODE_ENV=production \
    PORT=4000 \
    APP_VERSION=${APP_VERSION} \
    STORAGE_LOCAL_DIR=/data/uploads
# The only place the app writes. A new named volume mounted here starts with this ownership.
RUN mkdir -p /data/uploads && chown node:node /data/uploads
WORKDIR /app
# Owned by root and read-only to the app user.
COPY --from=build /out/package.json ./package.json
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /repo/apps/api/dist ./dist
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 4000) + '/v1/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
# Migrations are idempotent (already-applied ones are skipped). If they fail, the container
# exits instead of serving against an out-of-date schema.
CMD ["sh", "-c", "node dist/scripts/migrate.js && exec node dist/main.js"]
