import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthContext, TenantContext } from '@helix/core';
import { CorrelationId, CurrentTenant, CurrentUser, Product, RequirePermission } from '../../shared/http/decorators';
import { CalendarService } from './calendar.service';
import { CreateEventDto } from './dto/create-event.dto';

/**
 * The controller is thin by design. `@Product` enforces tenant entitlement and
 * `@RequirePermission` enforces RBAC — both handled by kernel guards, both
 * declared next to the route so an auditor can read the security model straight
 * off the code.
 */
@ApiTags('calendar')
@Product('calendar')
@Controller('v1/calendar')
export class CalendarController {
  constructor(private readonly calendar: CalendarService) {}

  @Get('events')
  @RequirePermission('calendar.event.read')
  @ApiOperation({ summary: 'List events in a time range (cursor paginated)' })
  list(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() auth: AuthContext,
    @CorrelationId() correlationId: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.calendar.listEvents(
      { tenant, auth, correlationId },
      { from: new Date(from ?? Date.now()), to: new Date(to ?? Date.now() + 30 * 864e5), cursor },
    );
  }

  @Post('events')
  @RequirePermission('calendar.event.create')
  @ApiOperation({ summary: 'Create an event' })
  create(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() auth: AuthContext,
    @CorrelationId() correlationId: string,
    @Body() dto: CreateEventDto,
  ) {
    return this.calendar.createEvent({ tenant, auth, correlationId }, dto);
  }

  @Delete('events/:id')
  @RequirePermission('calendar.event.delete')
  @ApiOperation({ summary: 'Cancel an event' })
  async remove(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() auth: AuthContext,
    @CorrelationId() correlationId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.calendar.deleteEvent({ tenant, auth, correlationId }, id);
    return { deleted: true };
  }
}
