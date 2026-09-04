import { Injectable } from '@nestjs/common';
import { createHmac, randomUUID } from 'node:crypto';
import { PlatformError } from '@helix/core';
import { PrismaService } from '../../shared/prisma/prisma.service';

/**
 * File storage for every product.
 *
 * Bytes never pass through the API. Clients receive a short-lived pre-signed URL
 * and upload directly to object storage, so file size does not consume
 * application capacity and a 5GB upload cannot occupy an API worker.
 *
 * Keys are namespaced `tenant/{tenantId}/{product}/{uuid}` so that per-tenant
 * deletion, per-tenant encryption keys and per-tenant lifecycle rules are all
 * expressible as a prefix.
 */
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024 * 1024;
const BLOCKED_MIME = new Set(['application/x-msdownload', 'application/x-sh']);

@Injectable()
export class StorageService {
  constructor(private readonly prisma: PrismaService) {}

  async createUploadUrl(params: {
    tenantId: string; product: string; ownerId: string;
    fileName: string; mimeType: string; sizeBytes: number;
  }) {
    if (params.sizeBytes > MAX_UPLOAD_BYTES) {
      throw new PlatformError('validation_failed', 'File exceeds the 5GB limit');
    }
    if (BLOCKED_MIME.has(params.mimeType)) {
      throw new PlatformError('validation_failed', `Uploads of type ${params.mimeType} are not allowed`);
    }

    const storageKey = `tenant/${params.tenantId}/${params.product}/${randomUUID()}/${encodeURIComponent(params.fileName)}`;
    const file = await this.prisma.fileObject.create({
      data: {
        tenantId: params.tenantId,
        product: params.product,
        bucket: process.env.S3_BUCKET ?? 'helix-dev',
        storageKey,
        fileName: params.fileName,
        mimeType: params.mimeType,
        sizeBytes: BigInt(params.sizeBytes),
        checksum: '',
        ownerId: params.ownerId,
      },
    });

    return { fileId: file.id, uploadUrl: this.sign(storageKey, 900), expiresIn: 900 };
  }

  /** Downloads are equally pre-signed and expire in 5 minutes. */
  async createDownloadUrl(tenantId: string, fileId: string) {
    const file = await this.prisma.fileObject.findFirst({ where: { id: fileId, tenantId } });
    if (!file) throw new PlatformError('not_found', 'File not found');
    if (file.virusStatus === 'infected') {
      throw new PlatformError('forbidden', 'File failed malware scanning');
    }
    return { url: this.sign(file.storageKey, 300), fileName: file.fileName, mimeType: file.mimeType };
  }

  /**
   * Stand-in for the S3 SDK's presigner so the sample runs without cloud
   * credentials. In production this is `@aws-sdk/s3-request-presigner`; the
   * call site does not change.
   */
  private sign(key: string, ttl: number): string {
    const expires = Math.floor(Date.now() / 1000) + ttl;
    const sig = createHmac('sha256', process.env.S3_SECRET_KEY ?? 'dev')
      .update(`${key}:${expires}`).digest('hex');
    return `${process.env.S3_ENDPOINT}/${process.env.S3_BUCKET}/${key}?X-Expires=${expires}&X-Signature=${sig}`;
  }
}
