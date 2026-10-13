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
- **Docker Context Path**: `.` (the repo root). **Required, don't leave it empty.** Empty means Dokploy builds from the Dockerfile's own folder (e.g. `apps/api`), and the build fails with `"/pnpm-workspace.yaml": not found`, because every Dockerfile needs the repo root and the shared `packages/`.
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

| Group      | Variable                              | Value                                                                                   |
| ---------- | ------------------------------------- | --------------------------------------------------------------------------------------- |
| Core       | `NODE_ENV`                            | `production` (the image already sets it)                                                |
|            | `TRUST_PROXY`                         | `2` (Traefik, then the Next app, sit in front of the API)                               |
|            | `PORT`, `LOG_LEVEL`, `APP_VERSION`    | optional; defaults `4000`, `info`, `0.0.0`                                              |
| Database   | `DATABASE_URL`                        | Postgres **Internal Connection URL**                                                    |
|            | `DB_POOL_MAX`                         | optional, default `10`                                                                  |
| Redis      | `REDIS_URL`                           | Redis **Internal Connection URL**                                                       |
| Sites      | `WEB_ORIGIN`                          | `https://predict.scoutgram.africa` (used for links in emails)                           |
|            | `ADMIN_ORIGIN`                        | `https://predict-admin.scoutgram.africa`                                                |
| Security   | `AUTH_SECRET`                         | the value you generated                                                                 |
|            | `DATA_ENCRYPTION_KEY`                 | the value you generated                                                                 |
|            | `DATA_ENCRYPTION_KEY_ID`              | optional, default `k1`                                                                  |
|            | `COOKIE_SECURE`                       | leave unset (on by default in production; the sites are HTTPS through Traefik)          |
|            | `ADMIN_MFA_REQUIRED`                  | leave unset (on by default in production)                                               |
|            | `TURNSTILE_SECRET_KEY`                | Turnstile secret key; leave empty to skip the check                                     |
| Email      | `EMAIL_TRANSPORT`                     | `zapiack`                                                                               |
|            | `EMAIL_FROM`                          | e.g. `predict@scoutgram.africa` (on a domain verified with Zapiack)                     |
|            | `ZAPIACK_API_KEY`                     | your Zapiack API key                                                                    |
|            | `ZAPIACK_TEMPLATE_ID`                 | the approved template's ID                                                              |
|            | `EMAIL_DAILY_CAP`, `ZAPIACK_BASE_URL` | optional; defaults `5000`, Zapiack's API                                                |
| Storage    | `STORAGE_LOCAL_DIR`                   | leave unset: the image keeps uploads in `/data/uploads` (mount the volume there, below) |
| Monitoring | `SENTRY_DSN`                          | optional                                                                                |
| Jobs       | `TICKER_INTERVAL_SEC`                 | optional, default `20` (opens and closes days, sends queued emails)                     |

In production the API refuses to start if email or storage isn't set up properly. The app's **Logs** list every missing or invalid variable.

**Domains**: none. Browsers only talk to the two sites, and each site forwards `/api/*` to `http://predict-api:4000` over the private network. That keeps sign-in cookies first-party, needs no CORS, and leaves the API with no public address to attack. Anything that needs the API from outside can use `https://predict.scoutgram.africa/api/...`.

**Volumes** (Advanced → Volumes → Add Volume): add a **Volume Mount** with **Volume Name** `predict-uploads` and **Mount Path** `/data/uploads`. Team and sponsor logos are stored there; without it they're lost on every redeploy. Use a volume mount, not a bind mount: a new volume takes the folder's permissions from the image, so the app can write to it. (A bind-mounted host folder would have to be owned by user id 1000.)

**Replicas**: keep 1 (the default). Migrations run when the container starts, the background timer expects a single instance, and the uploads volume lives on one server.

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

### If the API won't start

The API applies migrations before it starts, and its **Logs** say why if that fails, starting with `Migrations failed against <user>@<host>/<database>` and a hint. The usual causes:

- **Host not found** (`ENOTFOUND` / `EAI_AGAIN`, retried for a minute first): the host in `DATABASE_URL` must be the Postgres service's **App Name**. Copy its **Internal Connection URL** rather than typing it.
- **Wrong password** (`28P01`): copy the Internal Connection URL again. A hand-typed password with `@ : / # ? % &` in it must be URL-encoded.
- **No such database** (`3D000`) or **permission denied** (`42501`): use the database name and user from the Internal Connection URL.

## 4. Updates

Push to the deploy branch. Dokploy rebuilds only the apps whose watch paths changed, and the API applies any new migrations when it starts. To redeploy without a code change, press **Deploy** on the app.

Rebuild both sites (press **Deploy**) whenever you change a build-time argument, such as the API's App Name or the Turnstile site key.

Builds need internet access (packages and web fonts are downloaded) and a few GB of free disk. Turn on Dokploy's Docker cleanup for the server so old build layers don't fill it up.

## 5. Backups

**Database**

1. Create a **private** S3-compatible bucket for backups, e.g. DigitalOcean Spaces, Backblaze B2 or Cloudflare R2. It must not be public: anyone could download the database from it.
2. In Dokploy, go to **Settings → S3 Destinations** and add one: **Name** `backups`; the **Provider** for your bucket (or the generic S3-compatible option); its **Access Key Id**, **Secret Access Key**, **Bucket**, **Region** and **Endpoint**. Press **Test connection**, then **Create**.
3. On `predict-postgres`, open **Backups** and add a backup: **Destination** `backups`, the database name from its Internal Connection URL, **Schedule** `0 3 * * *` (daily at 03:00 server time), **Prefix Destination** `predict/`, **Keep the latest** `30`, **Enabled** on.
4. Run it once by hand and check that a file appears in the bucket.
5. Practise a restore before launch, then monthly: restore the latest backup into a new, temporary Postgres service and look at the data. Delete that service afterwards.
6. Keep `DATA_ENCRYPTION_KEY` with your backup notes. A restore without it can't read bank account numbers.

**Logos**

The `predict-uploads` volume only holds team and sponsor logos, which you can upload again if they're lost. If your Dokploy version offers **Volume Backups** on the API app, point it at the same destination. Otherwise, copy the volume after you add or change logos, from the server's terminal:

```
docker run --rm -v predict-uploads:/data -v "$PWD":/backup alpine tar czf /backup/predict-uploads.tgz -C /data .
```
