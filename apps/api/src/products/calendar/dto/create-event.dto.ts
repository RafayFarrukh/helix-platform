import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

/**
 * DTOs are validated at the edge with a global whitelisting pipe: unknown fields
 * are stripped and mass-assignment is impossible by construction.
 */
export class CreateEventDto {
  @ApiProperty() @IsUUID() calendarId!: string;
  @ApiProperty() @IsString() @MaxLength(300) title!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(10_000) description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) location?: string;
  @ApiProperty() @IsDateString() startsAt!: string;
  @ApiProperty() @IsDateString() endsAt!: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() allDay?: boolean;
  @ApiPropertyOptional({ description: 'RFC 5545 RRULE' }) @IsOptional() @IsString() recurrence?: string;
}
