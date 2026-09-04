import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsInt, IsISO8601, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import type { AuthContext, TenantContext } from '@helix/core';
import { CorrelationId, CurrentTenant, CurrentUser, Product, RequirePermission } from '../../shared/http/decorators';
import { MeetService } from './meet.service';

class ScheduleRoomDto {
  @IsString() @MaxLength(200) title!: string;
  @IsISO8601() startsAt!: string;
  @IsOptional() @IsInt() @Min(2) @Max(1000) maxParticipants?: number;
}

@ApiTags('meet')
@Product('meet')
@Controller('v1/meet')
export class MeetController {
  constructor(private readonly meet: MeetService) {}

  @Get('rooms')
  @RequirePermission('meet.room.read')
  @ApiOperation({ summary: 'List active rooms' })
  list(@CurrentTenant() tenant: TenantContext, @CurrentUser() auth: AuthContext, @CorrelationId() correlationId: string) {
    return this.meet.listRooms({ tenant, auth, correlationId });
  }

  @Post('rooms')
  @RequirePermission('meet.room.create')
  @ApiOperation({ summary: 'Schedule a room (also creates a calendar event via the event bus)' })
  schedule(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() auth: AuthContext,
    @CorrelationId() correlationId: string,
    @Body() dto: ScheduleRoomDto,
  ) {
    return this.meet.scheduleRoom({ tenant, auth, correlationId }, dto);
  }
}
