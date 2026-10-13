# Deploying on Dokploy

Everything runs on one Dokploy server: two database services and three applications, all on Dokploy's private `dokploy-network`. Dokploy's Traefik handles HTTPS and the domains.

```
 predict.scoutgram.africa ──► web   (port 3000) ─┐
                                                 ├─ /api/* ──► api (port 4000) ──► Postgres, Redis
 predict-admin.scoutgram.africa ──► admin (3001) ┘             private network only
```

| Dokploy service | Type        | App Name (internal hostname) | Dockerfile              |
| --------------- | ----------- | ---------------------------- | ----------------------- |
| Postgres        | Database    | `predict-postgres`           | –                       |
| Redis           | Database    | `predict-redis`              | –                       |
| API             | Application | `predict-api`                | `apps/api/Dockerfile`   |
| Player site     | Application | `predict-web`                | `apps/web/Dockerfile`   |
| Staff dashboard | Application | `predict-admin`              | `apps/admin/Dockerfile` |

The **App Name** is the hostname the other services use. Dokploy suggests one with a random suffix; change it to the names above when you create each service. If you keep Dokploy's name, use it everywhere this guide says `predict-api`, `predict-postgres` or `predict-redis`.

## Before you start

- **DNS:** add an A record for `predict.scoutgram.africa` and one for `predict-admin.scoutgram.africa`, both pointing at the Dokploy server's IP. If the DNS is on Cloudflare, set them to **DNS only** (grey cloud) so Let's Encrypt can issue certificates and the client IP reaches the app.
- **Email:** a Zapiack API key, a sending address on a domain verified with Zapiack, and the approved template ID. Create the template **from your own machine before deploying**: the API won't start in production without `ZAPIACK_TEMPLATE_ID`, so you can't use its terminal for this. In a checkout of this repo, put `ZAPIACK_API_KEY` in `.env`, then run `pnpm install && pnpm build && pnpm --filter @predict/api zapiack:template`. It prints the template ID and whether it's approved (`--status <id>` checks again later). See [RUNBOOK.md](RUNBOOK.md#first-time-setup).
- **Logos:** the R2 details for scoutgram's public bucket. This app keeps its files under the `predict/` prefix. Use an R2 API token with read and write access to that bucket. Logos upload straight from the staff dashboard's browser to R2, so add a CORS rule to the bucket (R2 → bucket → Settings → CORS policy) allowing origin `https://predict-admin.scoutgram.africa`, method `PUT` and header `content-type`. Keep scoutgram's existing rules.
- **Secrets:** generate these two now and save them in your password manager:
  - `AUTH_SECRET`: `openssl rand -hex 32`
  - `DATA_ENCRYPTION_KEY`: `openssl rand -base64 32`

  If you lose `DATA_ENCRYPTION_KEY`, stored bank account numbers can't be read any more, even from a backup.

- **Turnstile (optional):** a Cloudflare Turnstile site key (for the web build) and its secret key (for the API).

## 1. Databases

In your Dokploy project, choose **Create Service → Database**.

**Postgres**

- Name and **App Name**: `predict-postgres`
- **Database Name**: `predict`, **Database User**: `predict`, **Database Password**: a long random one
- **Docker image**: `postgres:17` (Dokploy's default is newer; this app is developed and tested on 17)
- Create it, then press **Deploy**. Don't set an External Port; the apps connect over the private network.
- In the database's **Internal Credentials**, copy the **Internal Connection URL**. It looks like `postgresql://predict:<password>@predict-postgres:5432/predict`. This is the API's `DATABASE_URL`.

**Redis**

- Name and **App Name**: `predict-redis`
- **Database Password**: a long random one
- **Docker image**: `redis:7` (matches development; Dokploy's default `redis:8` also works)
- Deploy it and copy its **Internal Connection URL**: `redis://default:<password>@predict-redis:6379`. This is the API's `REDIS_URL`.

## 2. The three applications

Create each one with **Create Service → Application**, then set these in its **General** tab.

**Source (Provider: GitHub)**

- **Repository**: this repo. **Branch**: the branch you deploy from (e.g. `main`).
- **Build Path**: `/`
- **Trigger Type**: On Push, and turn **Autodeploy** on.
- **Watch Paths**: listed per app below. A push only redeploys an app when it touches one of its paths. Pressing **Deploy** yourself always deploys.

**Build Type: Dockerfile**

- **Docker File**: the app's Dockerfile from the table above
- **Docker Context Path**: `.` (the repo root; every Dockerfile needs the shared `packages/`)
- **Docker Build Stage**: leave empty

**Environment tab**

- Turn **Create Environment File** off. The images read their settings from the environment Dokploy passes in, and `.dockerignore` keeps any generated `.env` out of the build anyway.
- Leave **Advanced → Ports** empty for all three apps. Traefik reaches web and admin over the private network.

### API (`predict-api`)

**Watch Paths**

```
apps/api/**
packages/brand/**
packages/contracts/**
packages/db/**
packages/domain/**
packages/config-typescript/**
package.json
pnpm-lock.yaml
pnpm-workspace.yaml
.npmrc
.dockerignore
```

**Build-time Arguments**: none.

**Environment Settings** (runtime). Each setting is listed with its value or what to put there.

| Group      | Variable                                                                      | Value                                                                          |
| ---------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Core       | `NODE_ENV`                                                                    | `production` (the image already sets it)                                       |
|            | `TRUST_PROXY`                                                                 | `2` (Traefik, then the Next app, sit in front of the API)                      |
|            | `PORT`, `LOG_LEVEL`, `APP_VERSION`                                            | optional; defaults `4000`, `info`, `0.0.0`                                     |
| Database   | `DATABASE_URL`                                                                | Postgres **Internal Connection URL**                                           |
|            | `DB_POOL_MAX`                                                                 | optional, default `10`                                                         |
| Redis      | `REDIS_URL`                                                                   | Redis **Internal Connection URL**                                              |
| Sites      | `WEB_ORIGIN`                                                                  | `https://predict.scoutgram.africa` (used for links in emails)                  |
|            | `ADMIN_ORIGIN`                                                                | `https://predict-admin.scoutgram.africa`                                       |
| Security   | `AUTH_SECRET`                                                                 | the value you generated                                                        |
|            | `DATA_ENCRYPTION_KEY`                                                         | the value you generated                                                        |
|            | `DATA_ENCRYPTION_KEY_ID`                                                      | optional, default `k1`                                                         |
|            | `COOKIE_SECURE`                                                               | leave unset (on by default in production; the sites are HTTPS through Traefik) |
|            | `ADMIN_MFA_REQUIRED`                                                          | leave unset (on by default in production)                                      |
|            | `TURNSTILE_SECRET_KEY`                                                        | Turnstile secret key; leave empty to skip the check                            |
| Email      | `EMAIL_TRANSPORT`                                                             | `zapiack`                                                                      |
|            | `EMAIL_FROM`                                                                  | e.g. `predict@scoutgram.africa` (on a domain verified with Zapiack)            |
|            | `ZAPIACK_API_KEY`                                                             | your Zapiack API key                                                           |
|            | `ZAPIACK_TEMPLATE_ID`                                                         | the approved template's ID                                                     |
|            | `EMAIL_DAILY_CAP`, `ZAPIACK_BASE_URL`                                         | optional; defaults `5000`, Zapiack's API                                       |
| Storage    | `STORAGE_DRIVER`                                                              | `r2`                                                                           |
|            | `STORAGE_KEY_PREFIX`                                                          | `predict/` (keeps this app's files apart in scoutgram's bucket)                |
|            | `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` | from the R2 token and bucket                                                   |
|            | `R2_PUBLIC_URL`                                                               | the bucket's public URL (e.g. its custom domain)                               |
| Monitoring | `SENTRY_DSN`                                                                  | optional                                                                       |
| Jobs       | `TICKER_INTERVAL_SEC`                                                         | optional, default `20` (opens and closes days, sends queued emails)            |

In production the API refuses to start if email or storage isn't set up properly. The app's **Logs** list every missing or invalid variable.

**Domains**: none. Browsers only talk to the two sites, and each site forwards `/api/*` to `http://predict-api:4000` over the private network. That keeps sign-in cookies first-party, needs no CORS, and leaves the API with no public address to attack. Anything that needs the API from outside can use `https://predict.scoutgram.africa/api/...`.

**Replicas**: keep 1 (the default). Migrations run when the container starts, and the background timer expects a single instance.

### Player site (`predict-web`)

**Watch Paths**

```
apps/web/**
packages/api-client/**
packages/brand/**
packages/contracts/**
packages/domain/**
packages/ui/**
packages/config-typescript/**
package.json
pnpm-lock.yaml
pnpm-workspace.yaml
.npmrc
.dockerignore
```

**Build-time Arguments**. These are fixed into the build, so change one and you must redeploy.

```
API_ORIGIN=http://predict-api:4000
NEXT_PUBLIC_SITE_URL=https://predict.scoutgram.africa
NEXT_PUBLIC_TURNSTILE_SITE_KEY=<Turnstile site key, or leave empty>
```

`API_ORIGIN` is required: the build stops with an error if it's missing or ends in `/`. Optional: `NEXT_PUBLIC_SENTRY_DSN`.

**Environment Settings**: nothing required. Optional: `SENTRY_DSN`.

**Domains**: **Host** `predict.scoutgram.africa`, **Path** `/`, **Container Port** `3000`, **HTTPS** on, **Certificate** Let's Encrypt.

### Staff dashboard (`predict-admin`)

**Watch Paths**: the same list as the player site, with `apps/admin/**` instead of `apps/web/**`.

**Build-time Arguments**

```
API_ORIGIN=http://predict-api:4000
```

Optional: `NEXT_PUBLIC_SENTRY_DSN`.

**Environment Settings**: nothing required. Optional: `SENTRY_DSN`.

**Domains**: **Host** `predict-admin.scoutgram.africa`, **Path** `/`, **Container Port** `3001`, **HTTPS** on, **Certificate** Let's Encrypt.

## 3. First deploy checklist

1. Deploy `predict-postgres` and `predict-redis`, and wait until both are running.
2. Deploy `predict-api`. Its **Logs** should show `Migrations applied.` and then `API listening`. Migrations run on every start and skip anything already applied. If one fails, the container stops instead of serving against an old schema.
3. Create the first staff account: on `predict-api`, press **Open Terminal** (choose `sh`), then run:

   ```
   node dist/scripts/create-admin.js --email you@scoutgram.africa --name "Your Name" --role super_admin
   ```

   The password is printed once; store it in your password manager. Add more staff the same way with `--role operations` or `--role finance`. To reset a password, use `--reset-password`. Default settings are created on first use, so no seeding is needed.

4. Deploy `predict-web` and `predict-admin`.
5. Check:
   - `https://predict.scoutgram.africa/api/v1/health` returns `"status":"ok"` with `"database":"up"` and `"redis":"up"`.
   - `https://predict.scoutgram.africa` loads, and the padlock shows a valid certificate.
   - `https://predict-admin.scoutgram.africa` shows the sign-in page. Sign in; the first sign-in asks you to set up an authenticator app.
6. Set up backups (next section) before taking real money.

Each image has a built-in health check (API: `/v1/health`; sites: the home page), which Dokploy uses to tell when a new version is ready.

## 4. Updates

Push to the deploy branch. Dokploy rebuilds only the apps whose watch paths changed, and the API applies any new migrations when it starts. To redeploy without a code change, press **Deploy** on the app.

Rebuild both sites (press **Deploy**) whenever you change a build-time argument, such as the API's App Name or the Turnstile site key.

Builds need internet access (packages and web fonts are downloaded) and a few GB of free disk. Turn on Dokploy's Docker cleanup for the server so old build layers don't fill it up.

## 5. Backups

1. Create a **private** R2 bucket for backups. Don't use the public logo bucket: anyone could download the database from there.
2. In Dokploy, go to **Settings → S3 Destinations** and add one: **Name** `r2-backups`; **Provider** Cloudflare (or the generic S3-compatible option); **Access Key Id** and **Secret Access Key** from an R2 token for that bucket; **Bucket** the bucket name; **Region** `auto`; **Endpoint** `https://<account id>.r2.cloudflarestorage.com`. Press **Test connection**, then **Create**.
3. On `predict-postgres`, open **Backups** and add a backup: **Destination** `r2-backups`, **Database** `predict`, **Schedule** `0 3 * * *` (daily at 03:00 server time), **Prefix Destination** `predict/`, **Keep the latest** `30`, **Enabled** on.
4. Run it once by hand and check that a file appears in the bucket.
5. Practise a restore before launch, then monthly: restore the latest backup into a new, temporary Postgres service and look at the data. Delete that service afterwards.
6. Keep `DATA_ENCRYPTION_KEY` with your backup notes. A restore without it can't read bank account numbers.
