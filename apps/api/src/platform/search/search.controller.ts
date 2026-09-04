import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { TenantContext } from '@helix/core';
import { CurrentTenant } from '../../shared/http/decorators';
import { SearchService } from './search.service';

@ApiTags('platform')
@Controller('v1/platform/search')
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @Get()
  @ApiOperation({ summary: 'Search across every product the workspace has enabled' })
  async search_(
    @CurrentTenant() tenant: TenantContext,
    @Query('q') q: string,
    @Query('products') products?: string,
  ) {
    const scope = products?.split(',').filter((p) => tenant.enabledProducts.includes(p));
    return { data: await this.search.query(tenant.tenantId, q ?? '', scope) };
  }
}
