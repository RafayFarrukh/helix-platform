import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { TenantContext } from '@helix/core';
import { CurrentTenant } from '../../shared/http/decorators';
import { ProductRegistryService } from './product-registry.service';

@ApiTags('platform')
@Controller('v1/platform/products')
export class RegistryController {
  constructor(private readonly registry: ProductRegistryService) {}

  @Get()
  @ApiOperation({ summary: 'Products available to this workspace (app launcher)' })
  list(@CurrentTenant() tenant: TenantContext) {
    return { data: this.registry.launcherFor(tenant.tier, tenant.enabledProducts) };
  }

  @Get('permissions')
  @ApiOperation({ summary: 'Full permission catalogue, aggregated from product manifests' })
  permissions() {
    return { data: this.registry.registry.permissionCatalogue() };
  }
}
