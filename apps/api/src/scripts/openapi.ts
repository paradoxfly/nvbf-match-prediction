// Writes the OpenAPI document to stdout; used by CI to diff the API surface between commits.
import { generateOpenApiDocument } from '../openapi';

void generateOpenApiDocument(process.env.APP_VERSION ?? '0.0.0').then((document) => {
  process.stdout.write(`${JSON.stringify(document, null, 2)}\n`);
});
