import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { PlatformError } from '@helix/core';
import { PUBLIC_KEY } from '../decorators';

/**
 * Global authentication guard. Routes are protected by default and must opt out
 * with `@Public()` — the safe direction for a platform where 100 teams add
 * endpoints. Forgetting a decorator locks a route down; it never opens one up.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly jwt: JwtService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
      ctx.getHandler(), ctx.getClass(),
    ]);
    const req = ctx.switchToHttp().getRequest();
    if (isPublic) return true;

    const header = req.headers.authorization as string | undefined;
    if (!header?.startsWith('Bearer ')) {
      throw new PlatformError('unauthenticated', 'Missing bearer token');
    }

    try {
      const payload = await this.jwt.verifyAsync(header.slice(7), {
        secret: process.env.JWT_ACCESS_SECRET,
      });
      req.auth = {
        userId: payload.sub,
        sessionId: payload.sid,
        permissions: payload.perms ?? [],
      };
      req.tokenTenantId = payload.tid;
      return true;
    } catch {
      throw new PlatformError('unauthenticated', 'Invalid or expired token');
    }
  }
}
