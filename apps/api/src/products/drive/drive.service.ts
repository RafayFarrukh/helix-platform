import { Inject, Injectable } from '@nestjs/common';
import type { EventBus, RequestContext } from '@helix/core';
import { PlatformError } from '@helix/core';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { StorageService } from '../../platform/storage/storage.service';
import { EVENT_BUS } from '../../platform/events/events.module';

/**
 * Drive stores no bytes. It owns the *tree* (folders, names, sharing) and points
 * at platform-managed objects. Every product that handles files reuses the same
 * storage kernel — one place for pre-signed URLs, malware scanning, encryption,
 * retention and per-tenant deletion.
 */
@Injectable()
export class DriveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    @Inject(EVENT_BUS) private readonly events: EventBus,
  ) {}

  async list(ctx: RequestContext, parentId: string | null) {
    return this.prisma.driveNode.findMany({
      where: { tenantId: ctx.tenant.tenantId, parentId, trashedAt: null },
      orderBy: [{ kind: 'asc' }, { name: 'asc' }],
      take: 200,
    });
  }

  async createFolder(ctx: RequestContext, name: string, parentId: string | null) {
    if (parentId) {
      const parent = await this.prisma.driveNode.findFirst({
        where: { id: parentId, tenantId: ctx.tenant.tenantId, kind: 'folder' },
      });
      if (!parent) throw new PlatformError('not_found', 'Parent folder not found');
    }
    return this.prisma.driveNode.create({
      data: { tenantId: ctx.tenant.tenantId, ownerId: ctx.auth!.userId, name, kind: 'folder', parentId },
    });
  }

  /** Returns a pre-signed URL; the client uploads straight to object storage. */
  async requestUpload(ctx: RequestContext, input: { fileName: string; mimeType: string; sizeBytes: number; parentId: string | null }) {
    const upload = await this.storage.createUploadUrl({
      tenantId: ctx.tenant.tenantId,
      product: 'drive',
      ownerId: ctx.auth!.userId,
      fileName: input.fileName,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
    });

    const node = await this.prisma.driveNode.create({
      data: {
        tenantId: ctx.tenant.tenantId,
        ownerId: ctx.auth!.userId,
        name: input.fileName,
        kind: 'file',
        parentId: input.parentId,
        fileId: upload.fileId,
        sizeBytes: BigInt(input.sizeBytes),
      },
    });

    await this.events.publish({
      name: 'drive.node.created',
      tenantId: ctx.tenant.tenantId,
      correlationId: ctx.correlationId,
      actorId: ctx.auth?.userId ?? null,
      payload: { nodeId: node.id, name: node.name },
    });

    return { node, ...upload };
  }
}
