import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';
import type { AuthContext, TenantContext } from '@helix/core';
import { CorrelationId, CurrentTenant, CurrentUser, Product, RequirePermission } from '../../shared/http/decorators';
import { DriveService } from './drive.service';

class CreateFolderDto {
  @IsString() @MaxLength(200) name!: string;
  @IsOptional() @IsUUID() parentId?: string;
}

class RequestUploadDto {
  @IsString() @MaxLength(300) fileName!: string;
  @IsString() mimeType!: string;
  @IsInt() @Min(1) sizeBytes!: number;
  @IsOptional() @IsUUID() parentId?: string;
}

@ApiTags('drive')
@Product('drive')
@Controller('v1/drive')
export class DriveController {
  constructor(private readonly drive: DriveService) {}

  @Get('nodes')
  @RequirePermission('drive.node.read')
  @ApiOperation({ summary: 'List folder contents' })
  list(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() auth: AuthContext,
    @CorrelationId() correlationId: string,
    @Query('parentId') parentId?: string,
  ) {
    return this.drive.list({ tenant, auth, correlationId }, parentId ?? null);
  }

  @Post('folders')
  @RequirePermission('drive.node.create')
  @ApiOperation({ summary: 'Create a folder' })
  createFolder(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() auth: AuthContext,
    @CorrelationId() correlationId: string,
    @Body() dto: CreateFolderDto,
  ) {
    return this.drive.createFolder({ tenant, auth, correlationId }, dto.name, dto.parentId ?? null);
  }

  @Post('uploads')
  @RequirePermission('drive.node.create')
  @ApiOperation({ summary: 'Request a pre-signed upload URL (bytes bypass the API)' })
  upload(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() auth: AuthContext,
    @CorrelationId() correlationId: string,
    @Body() dto: RequestUploadDto,
  ) {
    return this.drive.requestUpload({ tenant, auth, correlationId }, { ...dto, parentId: dto.parentId ?? null });
  }
}
