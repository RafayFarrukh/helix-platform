import { Global, Module, OnApplicationBootstrap } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuditService } from './audit/audit.service';
import { QuotaService } from './billing/quota.service';
import { UsageController } from './billing/usage.controller';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { FeatureFlagService } from './feature-flags/feature-flag.service';
import { HealthController } from './health/health.controller';
import { NotificationService } from './notifications/notification.service';
import { RbacService } from './rbac/rbac.service';
import { ProductRegistryService } from './registry/product-registry.service';
import { RegistryController } from './registry/registry.controller';
import { SearchController } from './search/search.controller';
import { SearchService } from './search/search.service';
import { StorageService } from './storage/storage.service';
import { TenancyService } from './tenancy/tenancy.service';

/**
 * The platform kernel: everything that is true for all 100+ products.
 *
 * A product never re-implements any of this, and — critically — a product can
 * never be shipped that *skips* any of it, because the guards, interceptors and
 * pipes are registered globally rather than per product.
 */
@Global()
@Module({
  imports: [
    JwtModule.register({ global: true, secret: process.env.JWT_ACCESS_SECRET }),
  ],
  controllers: [AuthController, HealthController, RegistryController, SearchController, UsageController],
  providers: [
    AuditService, QuotaService, AuthService, RbacService, TenancyService, SearchService, StorageService,
    NotificationService, FeatureFlagService, ProductRegistryService,
  ],
  exports: [
    AuditService, QuotaService, AuthService, RbacService, TenancyService, SearchService, StorageService,
    NotificationService, FeatureFlagService, ProductRegistryService,
  ],
})
export class PlatformModule implements OnApplicationBootstrap {
  constructor(private readonly rbac: RbacService) {}

  /** Sync every product's declared permissions into the RBAC catalogue. */
  async onApplicationBootstrap(): Promise<void> {
    await this.rbac.syncCatalogue().catch((e) =>
      console.warn('[rbac] catalogue sync skipped:', (e as Error).message),
    );
  }
}
