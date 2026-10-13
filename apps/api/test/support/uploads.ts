import sharp from 'sharp';
import type { TestApp } from './test-app';

type Agent = ReturnType<TestApp['client']>;

/** A small real PNG (so magic-byte checks and image processing run for real). */
export function pngBytes(width = 64, height = 48) {
  return sharp({ create: { width, height, channels: 4, background: '#ffd400' } })
    .png()
    .toBuffer();
}

/** Presign → PUT → confirm, like the admin app does. Returns the confirm response. */
export async function uploadLogo(
  agent: Agent,
  body: Buffer,
  mimeType = 'image/png',
  kind: 'team_logo' | 'sponsor_logo' = 'team_logo',
) {
  const ticket = await agent
    .post('/v1/admin/media/uploads')
    .send({ kind, mimeType, sizeBytes: body.length, fileName: `logo.${mimeType.split('/')[1]}` })
    .expect(200);
  await agent.put(ticket.body.upload.url).set('content-type', mimeType).send(body).expect(200);
  return agent.post(`/v1/admin/media/${ticket.body.mediaId}/confirm`).send({});
}
