import { randomUUID } from 'node:crypto';
import type { Params } from 'nestjs-pino';
import type { Env } from '../config/env';

export function loggerParams(env: Env): Params {
  return {
    pinoHttp: {
      level: env.LOG_LEVEL,
      transport:
        env.NODE_ENV === 'development'
          ? { target: 'pino-pretty', options: { singleLine: true, colorize: true } }
          : undefined,
      genReqId: (req, res) => {
        const incoming = req.headers['x-request-id'];
        const id = typeof incoming === 'string' && incoming.length <= 128 ? incoming : randomUUID();
        res.setHeader('x-request-id', id);
        return id;
      },
      redact: {
        paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
        censor: '[redacted]',
      },
      autoLogging: { ignore: (req) => req.url === '/v1/health' },
    },
  };
}
