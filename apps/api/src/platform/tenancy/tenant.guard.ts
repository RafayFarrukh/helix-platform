import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PlatformError } from '@helix/core';
import { PUBLIC_KEY } from '../../shared/http/decorators';
import { TenancyService } from './tenancy.service';

/**
 * Resolves the tenant for every authenticated request and pins it to the request
 * object. The tenant comes from the *token*, never from a client-supplied header,
 * so a caller cannot pivot into another workspace by editing a request. A
 * mismatched `X-Tenant-Id` header is treated as an attack and rejected outright.
 */
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly tenancy: TenancyService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest();
    const tenantId: string | undefined = req.tokenTenantId;
    if (!tenantId) throw new PlatformError('unauthenticated', 'Token carries no workspace');

    const header = req.headers['x-tenant-id'];
    if (header && header !== tenantId) {
      throw new PlatformError('forbidden', 'Tenant header does not match the authenticated workspace');
    }

    req.tenant = await this.tenancy.resolve(tenantId);
    return true;
  }
}
