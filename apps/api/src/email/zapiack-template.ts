import type { OutgoingEmail } from './email-transport';

/**
 * The one Zapiack template every email uses. Zapiack refuses raw HTML on send, so the layout
 * lives here and is created (and submitted for approval) once with `scripts/zapiack-template`.
 * Values are HTML-escaped by Zapiack; empty `code` / `actionUrl` hide their blocks.
 *
 * Changing the HTML means a new template: an approved body can't be edited on Zapiack.
 */
export const MESSAGE_TEMPLATE = {
  name: 'Predict: message',
  subject: '{{heading}}',
  category: 'TRANSACTIONAL',
  html: `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4f4f2;font-family:Helvetica,Arial,sans-serif;color:#0a0a0a">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f2;padding:24px 12px">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;overflow:hidden">
            <tr>
              <td style="background:#0a0a0a;padding:18px 24px;color:#ffffff;font-weight:800;font-size:18px">
                {{productName}}<span style="color:#ffd400">.</span>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 24px 8px">
                <h1 style="margin:0 0 16px;font-size:22px;line-height:1.25">{{heading}}</h1>
                {{#each paragraphs}}<p style="margin:0 0 14px;font-size:15px;line-height:1.55">{{this}}</p>{{/each}}
                {{#if code}}<p style="margin:8px 0 20px;font-family:Menlo,Consolas,monospace;font-size:34px;font-weight:700;letter-spacing:8px">{{code}}</p>{{/if}}
                {{#if actionUrl}}<p style="margin:8px 0 20px"><a href="{{actionUrl}}" style="display:inline-block;background:#0a0a0a;color:#ffd400;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:999px">{{actionLabel}}</a></p>{{/if}}
              </td>
            </tr>
            <tr>
              <td style="padding:16px 24px 24px;font-size:12px;color:#6b6b6b;border-top:1px solid #eeeeee">
                Sent by {{productName}}. You get this email because you have an account with us.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`,
} as const;

/** The template's variables for one email. */
export function messageVariables(email: OutgoingEmail, productName: string) {
  return {
    productName,
    heading: email.heading,
    paragraphs: email.paragraphs,
    code: email.code ?? '',
    actionLabel: email.action?.label ?? '',
    actionUrl: email.action?.url ?? '',
  };
}
