import { OpenAPIGenerator } from '@orpc/openapi';
import { ZodToJsonSchemaConverter } from '@orpc/zod/zod4';
import { contract } from '@predict/contracts';
import type { Express } from 'express';

export function generateOpenApiDocument(version: string) {
  const generator = new OpenAPIGenerator({ schemaConverters: [new ZodToJsonSchemaConverter()] });
  return generator.generate(contract, {
    info: { title: 'Predict API', version },
    servers: [{ url: '/v1' }],
  });
}

const DOCS_HTML = `<!doctype html>
<html>
  <head>
    <title>Predict API</title>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body>
    <script id="api-reference" data-url="/docs/openapi.json"></script>
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
  </body>
</html>`;

/** Serves the spec and an API reference UI at /docs. Never mounted in production. */
export async function mountApiDocs(app: Express, version: string) {
  const document = await generateOpenApiDocument(version);
  app.get('/docs/openapi.json', (_req, res) => res.json(document));
  app.get('/docs', (_req, res) => res.type('html').send(DOCS_HTML));
}
