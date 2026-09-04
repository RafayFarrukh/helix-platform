import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { AuthContext, TenantContext } from '@helix/core';

/** Marks a route as reachable without authentication (login, health, docs). */
export const PUBLIC_KEY = 'helix:public';
export const Public = () => SetMetadata(PUBLIC_KEY, true);

/**
 * Declarative authorisation. The permission string must exist in the product
 * manifest — the registry fails the boot if a guard references an unknown key,
 * so permissions cannot silently drift from what the product declared.
 */
export const PERMISSION_KEY = 'helix:permission';
export const RequirePermission = (permission: string) => SetMetadata(PERMISSION_KEY, permission);

/** Ties a controller to its product so the kernel can enforce entitlement + quotas. */
export const PRODUCT_KEY = 'helix:product';
export const Product = (productKey: string) => SetMetadata(PRODUCT_KEY, productKey);

export const CurrentTenant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): TenantContext =>
    ctx.switchToHttp().getRequest().tenant,
);

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthContext =>
    ctx.switchToHttp().getRequest().auth,
);

export const CorrelationId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string =>
    ctx.switchToHttp().getRequest().correlationId,
);
