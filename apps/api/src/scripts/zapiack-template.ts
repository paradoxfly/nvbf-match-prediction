/**
 * Sets up the one Zapiack email template every email uses, then (optionally) sends a test.
 *
 *   node dist/scripts/zapiack-template.js                      create the template and submit it
 *   node dist/scripts/zapiack-template.js --status <templateId>  check whether it's approved
 *   node dist/scripts/zapiack-template.js --test-to you@example.com
 *                                            send a sample with ZAPIACK_TEMPLATE_ID + EMAIL_FROM
 *
 * Needs ZAPIACK_API_KEY. Put the printed template id in ZAPIACK_TEMPLATE_ID once it's APPROVED.
 */
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { product } from '@predict/brand';
import { Email } from '@predict/contracts';
import { config } from 'dotenv';
import { signInCodeEmail } from '../email/messages';
import { ZapiackEmailTransport } from '../email/zapiack.transport';
import { MESSAGE_TEMPLATE } from '../email/zapiack-template';

config({ path: resolve(__dirname, '../../../../.env'), quiet: true });

const baseUrl = (process.env.ZAPIACK_BASE_URL || 'https://api.zapiack.com/v1').replace(/\/$/, '');

async function call(path: string, init: RequestInit = {}) {
  const apiKey = process.env.ZAPIACK_API_KEY;
  if (!apiKey) throw new Error('ZAPIACK_API_KEY is not set.');
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(
      `Zapiack ${response.status}: ${[body.message ?? 'request failed'].flat().join('; ')}`,
    );
  }
  return body;
}

function report(template: Record<string, unknown>) {
  console.warn(
    `Template ${String(template.templateId ?? template.id)}: ${String(template.status)}`,
  );
  if (template.status === 'APPROVED') {
    console.warn(
      `Set ZAPIACK_TEMPLATE_ID=${String(template.templateId ?? template.id)} on the API.`,
    );
  } else if (template.status === 'IN_REVIEW') {
    console.warn(
      'A Zapiack reviewer has to approve it before it can send. Check back with --status.',
    );
  } else if (template.status === 'REJECTED') {
    console.warn(`Rejected: ${String(template.rejectionReason ?? 'no reason given')}`);
  }
}

async function main() {
  const { values } = parseArgs({
    options: {
      status: { type: 'string' },
      'test-to': { type: 'string' },
    },
  });

  if (values.status) {
    report(await call(`/email/templates/${encodeURIComponent(values.status)}`));
    return;
  }

  if (values['test-to']) {
    const templateId = process.env.ZAPIACK_TEMPLATE_ID;
    if (!templateId) throw new Error('ZAPIACK_TEMPLATE_ID is not set.');
    const to = Email.parse(values['test-to'].trim().toLowerCase());
    const transport = new ZapiackEmailTransport({
      apiKey: process.env.ZAPIACK_API_KEY ?? '',
      baseUrl,
      templateId,
      from: process.env.EMAIL_FROM || 'predict@scoutgram.africa',
      productName: product.name,
    });
    const sent = await transport.send(to, signInCodeEmail('123456', 5), 'otp');
    console.warn(`Test email queued at Zapiack (id ${sent.providerMessageId ?? 'unknown'}).`);
    return;
  }

  const created = await call('/email/templates', {
    method: 'POST',
    body: JSON.stringify(MESSAGE_TEMPLATE),
  });
  const id = String(created.templateId ?? created.id);
  console.warn(`Created template ${id}; submitting it for approval…`);
  report(await call(`/email/templates/${encodeURIComponent(id)}/submit`, { method: 'POST' }));
}

main().catch((error: unknown) => {
  console.error((error as Error).message);
  process.exit(1);
});
