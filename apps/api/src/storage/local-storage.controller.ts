import { createReadStream } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createWriteStream } from 'node:fs';
import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  NotFoundException,
  Param,
  Put,
  Query,
  Req,
  Res,
  SetMetadata,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { SKIP_CLIENT_HEADER } from '../common/client-header.guard';
import { LocalStorage } from './local-storage';
import { OBJECT_STORAGE, inlineDisposition, type Bucket } from './storage';

const BUCKETS = new Set<Bucket>(['public', 'private']);

function keyFrom(path: string | string[]): string {
  return Array.isArray(path) ? path.join('/') : path;
}

/**
 * Accepts signed uploads and serves stored files (through the sites' /api proxy). The signature
 * is the credential here, so the first-party header check does not apply.
 */
@Controller('storage')
@SetMetadata(SKIP_CLIENT_HEADER, true)
export class LocalStorageController {
  constructor(@Inject(OBJECT_STORAGE) private readonly storage: LocalStorage) {}

  @Put(':bucket/*path')
  async upload(
    @Param('bucket') bucket: Bucket,
    @Param('path') path: string | string[],
    @Query() query: Record<string, string>,
    @Req() req: Request,
  ) {
    const key = keyFrom(path);
    const expires = Number(query.expires);
    const extra = `${query.type}\n${query.length}`;
    if (
      !BUCKETS.has(bucket) ||
      !this.storage.verify('PUT', bucket, key, expires, query.signature ?? '', extra)
    ) {
      throw new ForbiddenException('Invalid or expired upload URL.');
    }
    if (req.headers['content-type'] !== query.type) {
      throw new BadRequestException('Content-Type does not match the signed upload.');
    }
    const declared = Number(req.headers['content-length']);
    if (declared !== Number(query.length)) {
      throw new BadRequestException('Content-Length does not match the signed upload.');
    }

    const target = this.storage.pathFor(bucket, key);
    await mkdir(dirname(target), { recursive: true });
    let received = 0;
    req.on('data', (chunk: Buffer) => {
      received += chunk.length;
      if (received > declared) req.destroy(new Error('Upload larger than declared'));
    });
    try {
      await pipeline(req, createWriteStream(target));
    } catch {
      await rm(target, { force: true });
      throw new BadRequestException('Upload failed.');
    }
    await writeFile(`${target}.meta`, JSON.stringify({ contentType: query.type }));
    return { ok: true };
  }

  @Get('public/*path')
  async servePublic(@Param('path') path: string | string[], @Res() res: Response) {
    await this.serve('public', keyFrom(path), res);
  }

  @Get('private/*path')
  async servePrivate(
    @Param('path') path: string | string[],
    @Query() query: Record<string, string>,
    @Res() res: Response,
  ) {
    const key = keyFrom(path);
    if (!this.storage.verify('GET', 'private', key, Number(query.expires), query.signature ?? '')) {
      throw new ForbiddenException('Invalid or expired link.');
    }
    res.setHeader('Cache-Control', 'private, no-store');
    if (query.name) {
      res.setHeader('Content-Disposition', inlineDisposition(query.name));
    }
    await this.serve('private', key, res);
  }

  private async serve(bucket: Bucket, key: string, res: Response) {
    const info = await this.storage.head(bucket, key);
    if (!info) throw new NotFoundException();
    res.setHeader('Content-Type', info.contentType ?? 'application/octet-stream');
    res.setHeader('Content-Length', String(info.size));
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // Every upload gets a new random key, so a public file never changes once it's in use.
    if (bucket === 'public') res.setHeader('Cache-Control', 'public, max-age=86400');
    await pipeline(createReadStream(this.storage.pathFor(bucket, key)), res);
  }
}
