import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { RedisService } from '../../shared/redis/redis.service';
import { ProductRegistryService } from '../registry/product-registry.service';

/**
 * Role Based Access Control for the whole platform.
 *
 * Model: user → membership (per tenant) → roles → permissions.
 * Permission keys are `product.resource.action` and are *declared by product
 * manifests*, so adding product #101 adds its permissions to the catalogue
 * automatically — no central file to edit, no chance of a collision (the
 * registry rejects duplicates at boot).
 */
export const SYSTEM_ROLES = {
  owner: { name: 'Owner', description: 'Full control including billing and deletion' },
  admin: { name: 'Admin', description: 'Manage members, products and settings' },
  member: { name: 'Member', description: 'Use enabled products' },
  guest: { name: 'Guest', description: 'Read-only access to shared resources' },
} as const;

@Injectable()
export class RbacService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly registry: ProductRegistryService,
  ) {}

  /** Sync the permission catalogue from product manifests. Runs at boot. */
  async syncCatalogue(): Promise<number> {
    const catalogue = this.registry.registry.permissionCatalogue();
    for (const perm of catalogue) {
      await this.prisma.permission.upsert({
        where: { key: perm.key },
        create: perm,
        update: { product: perm.product, description: perm.description },
      });
    }
    return catalogue.length;
  }

  /** Create the four system roles for a new tenant, wired to manifest defaults. */
  async provisionSystemRoles(tx: Prisma.TransactionClient, tenantId: string) {
    const created: Record<string, { id: string }> = {};

    for (const [key, meta] of Object.entries(SYSTEM_ROLES)) {
      const role = await tx.role.create({
        data: { tenantId, key, name: meta.name, description: meta.description, isSystem: true },
      });
      created[key] = role;
    }

    // Owners implicitly hold everything; the other roles receive exactly the
    // permissions each product manifest granted them by default.
    for (const product of this.registry.registry.all()) {
      for (const perm of product.permissions) {
        for (const roleKey of perm.defaultRoles) {
          const role = created[roleKey];
          if (!role) continue;
          await tx.rolePermission.upsert({
            where: { roleId_permissionKey: { roleId: role.id, permissionKey: perm.key } },
            create: { roleId: role.id, permissionKey: perm.key },
            update: {},
          });
        }
      }
    }

    return created as Record<keyof typeof SYSTEM_ROLES, { id: string }>;
  }

  /**
   * Resolved permissions are cached per (tenant, user) and embedded in the access
   * token, so the request hot path performs no permission lookup at all. Cache is
   * invalidated on any role change; tokens are short-lived so drift is bounded
   * by the 15 minute access-token TTL.
   */
  async permissionsFor(tenantId: string, userId: string): Promise<string[]> {
    const key = this.redis.key(tenantId, 'perms', userId);
    return this.redis.cached(key, 300, async () => {
      const membership = await this.prisma.membership.findUnique({
        where: { tenantId_userId: { tenantId, userId } },
        include: { roles: { include: { role: { include: { permissions: true } } } } },
      });
      if (!membership) return [];
      if (membership.roles.some((r) => r.role.key === 'owner')) return ['*'];
      const perms = new Set<string>();
      for (const mr of membership.roles) {
        for (const rp of mr.role.permissions) perms.add(rp.permissionKey);
      }
      return [...perms];
    });
  }

  async invalidate(tenantId: string, userId: string): Promise<void> {
    await this.redis.client.del(this.redis.key(tenantId, 'perms', userId));
  }

  /** Wildcard-aware check: `calendar.*` grants `calendar.event.create`. */
  static allows(granted: string[], required: string): boolean {
    if (granted.includes('*') || granted.includes(required)) return true;
    const parts = required.split('.');
    for (let i = parts.length - 1; i > 0; i--) {
      if (granted.includes(`${parts.slice(0, i).join('.')}.*`)) return true;
    }
    return false;
  }
}
