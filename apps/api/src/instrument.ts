// Loaded before anything else so Sentry can instrument modules as they are required.
import { resolve } from 'node:path';
import { config } from 'dotenv';
import * as Sentry from '@sentry/nestjs';

// One .env at the repo root serves the API and the db scripts. In deployed
// environments the file is absent and variables come from the platform.
config({ path: resolve(__dirname, '../../../.env'), quiet: true });

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV,
    release: process.env.APP_VERSION,
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
  });
}
