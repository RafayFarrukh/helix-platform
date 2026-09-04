import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { TenantContext } from '@helix/core';
import { CurrentTenant } from '../../shared/http/decorators';
import { QuotaService } from './quota.service';

@ApiTags('platform')
@Controller('v1/platform/usage')
export class UsageController {
  constructor(private readonly quota: QuotaService) {}

  @Get()
  @ApiOperation({ summary: 'Quota usage across every product, from manifest limits' })
  async usage(@CurrentTenant() tenant: TenantContext) {
    return { tier: tenant.tier, data: await this.quota.usage(tenant.tenantId, tenant.tier) };
  }
}
