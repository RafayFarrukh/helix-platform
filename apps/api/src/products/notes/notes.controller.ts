import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';
import type { AuthContext, TenantContext } from '@helix/core';
import { CorrelationId, CurrentTenant, CurrentUser, Product, RequirePermission } from '../../shared/http/decorators';
import { NotesService } from './notes.service';

class CreateItemDto {
  @IsString() @MaxLength(300) title!: string;
}

@ApiTags('notes')
@Product('notes')
@Controller('v1/notes')
export class NotesController {
  constructor(private readonly notes: NotesService) {}

  @Get('items')
  @RequirePermission('notes.item.read')
  @ApiOperation({ summary: 'List items' })
  list(@CurrentTenant() tenant: TenantContext, @CurrentUser() auth: AuthContext, @CorrelationId() correlationId: string) {
    return this.notes.list({ tenant, auth, correlationId });
  }

  @Post('items')
  @RequirePermission('notes.item.create')
  @ApiOperation({ summary: 'Create an item' })
  create(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() auth: AuthContext,
    @CorrelationId() correlationId: string,
    @Body() dto: CreateItemDto,
  ) {
    return this.notes.create({ tenant, auth, correlationId }, dto);
  }
}
