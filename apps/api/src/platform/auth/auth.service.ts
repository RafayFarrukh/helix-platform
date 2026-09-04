import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'node:crypto';
import { PlatformError } from '@helix/core';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { RbacService } from '../rbac/rbac.service';
import { hashPassword, verifyPassword } from './password';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/**
 * Authentication is a kernel concern: no product implements login, sessions or
 * token refresh. Products only ever read `req.auth`.
 *
 * Token strategy:
 *   - Access token: short-lived (15m) JWT, stateless, carries tenant + resolved
 *     permissions so the hot path needs zero database reads.
 *   - Refresh token: opaque random string, hashed at rest, one row per session,
 *     rotated on every use with reuse detection.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger('auth');

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly rbac: RbacService,
  ) {}

  async register(email: string, password: string, displayName: string, tenantName: string) {
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new PlatformError('conflict', 'An account with that email already exists');

    const slug = tenantName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

    // Tenant, owner user, system roles and membership are created atomically:
    // a half-provisioned tenant is worse than a failed signup.
    return this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({ data: { slug, name: tenantName } });
      const user = await tx.user.create({
        data: { email, displayName, passwordHash: await hashPassword(password) },
      });
      const roles = await this.rbac.provisionSystemRoles(tx, tenant.id);
      const membership = await tx.membership.create({
        data: { tenantId: tenant.id, userId: user.id, status: 'active' },
      });
      await tx.membershipRole.create({ data: { membershipId: membership.id, roleId: roles.owner.id } });
      return { tenant, user };
    });
  }

  async login(email: string, password: string, ip?: string, userAgent?: string): Promise<TokenPair & { tenantId: string }> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { memberships: { where: { status: 'active' }, include: { tenant: true } } },
    });

    // Constant-ish work whether or not the user exists, so timing does not leak
    // account existence.
    const ok = user?.passwordHash ? await verifyPassword(password, user.passwordHash) : false;
    if (!user || !ok || user.status !== 'active') {
      throw new PlatformError('unauthenticated', 'Invalid email or password');
    }

    const membership = user.memberships[0];
    if (!membership) throw new PlatformError('forbidden', 'This account belongs to no active workspace');

    return { ...(await this.issue(user.id, membership.tenantId, ip, userAgent)), tenantId: membership.tenantId };
  }

  /** Rotating refresh: the presented token is revoked and replaced atomically. */
  async refresh(refreshToken: string, ip?: string, userAgent?: string): Promise<TokenPair> {
    const hash = createHash('sha256').update(refreshToken).digest('hex');
    const session = await this.prisma.session.findUnique({ where: { refreshTokenHash: hash } });

    if (!session || session.expiresAt < new Date()) {
      throw new PlatformError('unauthenticated', 'Session expired');
    }
    if (session.revokedAt) {
      // A revoked token being replayed means the token leaked. Kill every session
      // for that user rather than just refusing this one request.
      this.logger.warn(`Refresh token reuse detected for user ${session.userId}; revoking all sessions`);
      await this.prisma.session.updateMany({
        where: { userId: session.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new PlatformError('unauthenticated', 'Session revoked');
    }

    await this.prisma.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
    return this.issue(session.userId, session.tenantId!, ip, userAgent);
  }

  async logout(sessionId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async issue(userId: string, tenantId: string, ip?: string, userAgent?: string): Promise<TokenPair> {
    const permissions = await this.rbac.permissionsFor(tenantId, userId);
    const refreshToken = randomBytes(48).toString('base64url');
    const ttl = Number(process.env.REFRESH_TOKEN_TTL ?? 2_592_000);

    const session = await this.prisma.session.create({
      data: {
        userId,
        tenantId,
        refreshTokenHash: createHash('sha256').update(refreshToken).digest('hex'),
        ip,
        userAgent,
        expiresAt: new Date(Date.now() + ttl * 1000),
      },
    });

    const expiresIn = Number(process.env.ACCESS_TOKEN_TTL ?? 900);
    const accessToken = await this.jwt.signAsync(
      { sub: userId, tid: tenantId, sid: session.id, perms: permissions },
      { secret: process.env.JWT_ACCESS_SECRET, expiresIn },
    );

    return { accessToken, refreshToken, expiresIn };
  }
}
