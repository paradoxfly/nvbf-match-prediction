# syntax=docker/dockerfile:1
#
# Player site (Next.js, standalone server). Build from the repo root:
#
#   docker build -f apps/web/Dockerfile -t predict-web \
#     --build-arg API_ORIGIN=http://predict-api:4000 \
#     --build-arg NEXT_PUBLIC_TURNSTILE_SITE_KEY=0x4AAA... .
#
# Build arguments (Next fixes these into the build, so changing one means rebuilding):
#   API_ORIGIN                      required. Where /api/* is proxied: the API's internal address,
#                                   e.g. http://<api app name>:4000. No trailing slash.
#   NEXT_PUBLIC_SITE_URL            public URL of this site (metadata, sitemap, share links).
#   NEXT_PUBLIC_TURNSTILE_SITE_KEY  Cloudflare Turnstile site key; empty turns the widget off.
#   NEXT_PUBLIC_SENTRY_DSN          optional, browser error reporting.
#
# See docs/DEPLOY.md.

ARG NODE_IMAGE=node:22.23.2-alpine3.24

# Node plus the pnpm version pinned in package.json ("packageManager"), through Corepack.
FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    NEXT_TELEMETRY_DISABLED=1 \
    TURBO_TELEMETRY_DISABLED=1 \
    DO_NOT_TRACK=1
WORKDIR /repo
COPY package.json ./
RUN corepack enable && corepack install

# Keep only this app and the workspace packages it uses, with a lockfile trimmed to match.
FROM base AS prune
COPY pnpm-workspace.yaml ./
# turbo at the version in the workspace catalog.
RUN npm install --global --no-fund --no-audit \
      "turbo@$(sed -n 's/^ *turbo: *//p' pnpm-workspace.yaml)"
COPY . .
RUN turbo prune @predict/web --docker

FROM base AS build
# Dependencies first, so this layer is reused until a package.json or the lockfile changes.
COPY --from=prune /repo/out/json/ ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --store-dir=/pnpm/store
COPY --from=prune /repo/out/full/ ./

ARG API_ORIGIN
ARG NEXT_PUBLIC_SITE_URL=https://predict.scoutgram.africa
ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY=
ARG NEXT_PUBLIC_SENTRY_DSN=
# The /api rewrite target is fixed at build time. Without it the site would quietly proxy to
# localhost, so stop here instead.
RUN case "$API_ORIGIN" in \
      http://*[!/]|https://*[!/]) ;; \
      *) echo "Build argument API_ORIGIN must be the API's address without a trailing slash, e.g. http://predict-api:4000 (got '${API_ORIGIN}')." >&2; exit 1 ;; \
    esac
ENV NEXT_OUTPUT=standalone \
    API_ORIGIN=${API_ORIGIN} \
    NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL} \
    NEXT_PUBLIC_TURNSTILE_SITE_KEY=${NEXT_PUBLIC_TURNSTILE_SITE_KEY} \
    NEXT_PUBLIC_SENTRY_DSN=${NEXT_PUBLIC_SENTRY_DSN}
# Builds the shared packages, then the site (pnpm runs them in dependency order).
RUN pnpm --filter "@predict/web..." run build
# The app has no public/ folder today; make sure the copy below works either way.
RUN mkdir -p apps/web/public

FROM ${NODE_IMAGE} AS runtime
ARG API_ORIGIN
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    API_ORIGIN=${API_ORIGIN}
WORKDIR /app
# The standalone server keeps the monorepo layout: apps/web/server.js plus traced node_modules.
# Files are owned by root; only Next's cache folder is writable by the app user.
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /repo/apps/web/public ./apps/web/public
RUN mkdir -p apps/web/.next/cache && chown node:node apps/web/.next/cache
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/', { redirect: 'manual' }).then((r) => process.exit(r.status < 500 ? 0 : 1), () => process.exit(1))"]
CMD ["node", "apps/web/server.js"]
