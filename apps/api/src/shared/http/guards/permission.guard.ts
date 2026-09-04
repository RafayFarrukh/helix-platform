import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PlatformError } from '@helix/core';
import { PERMISSION_KEY, PRODUCT_KEY } from '../decorators';
import { RbacService } from '../../../platform/rbac/rbac.service';

/**
 * Two checks in one place, both driven by declarations rather than product code:
 *   1. Entitlement — is this product enabled for this tenant's plan?
 *   2. Authorisation — does the caller hold the declared permission?
 *
 * Doing this centrally means a new product gets correct security by declaring a
 * manifest, and a security fix ships once for all 100+ products.
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const productKey = this.reflector.getAllAndOverride<string>(PRODUCT_KEY, [ctx.getHandler(), ctx.getClass()]);
    const permission = this.reflector.getAllAndOverride<string>(PERMISSION_KEY, [ctx.getHandler(), ctx.getClass()]);

    // Recorded on the request so the audit trail attributes a denial to the
    // product whose route was called, not to the kernel that refused it.
    if (productKey) req.productKey = productKey;

    if (productKey && req.tenant && !req.tenant.enabledProducts.includes(productKey)) {
      throw new PlatformError('product_not_enabled', `The "${productKey}" product is not enabled for this workspace`, { product: productKey });
    }

    if (!permission) return true;
    if (!req.auth) throw new PlatformError('unauthenticated', 'Authentication required');

    if (!RbacService.allows(req.auth.permissions, permission)) {
      throw new PlatformError('forbidden', `Missing permission: ${permission}`, { required: permission });
    }
    return true;
  }
}
