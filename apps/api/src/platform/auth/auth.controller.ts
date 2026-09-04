import { Body, Controller, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import type { Request } from 'express';
import { CurrentUser, Public } from '../../shared/http/decorators';
import type { AuthContext } from '@helix/core';
import { AuthService } from './auth.service';

class RegisterDto {
  @IsEmail() email!: string;
  @IsString() @MinLength(12) @MaxLength(200) password!: string;
  @IsString() @MaxLength(120) displayName!: string;
  @IsString() @MaxLength(120) workspaceName!: string;
}

class LoginDto {
  @IsEmail() email!: string;
  @IsString() password!: string;
}

class RefreshDto {
  @IsString() refreshToken!: string;
}

@ApiTags('auth')
@Controller('v1/auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Create a workspace and its owner account' })
  async register(@Body() dto: RegisterDto) {
    const { tenant, user } = await this.auth.register(dto.email, dto.password, dto.displayName, dto.workspaceName);
    return { tenantId: tenant.id, tenantSlug: tenant.slug, userId: user.id };
  }

  @Public()
  @Post('login')
  @ApiOperation({ summary: 'Exchange credentials for an access + refresh token pair' })
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.auth.login(dto.email, dto.password, req.ip, req.headers['user-agent']);
  }

  @Public()
  @Post('refresh')
  @ApiOperation({ summary: 'Rotate the refresh token and mint a new access token' })
  refresh(@Body() dto: RefreshDto, @Req() req: Request) {
    return this.auth.refresh(dto.refreshToken, req.ip, req.headers['user-agent']);
  }

  @Post('logout')
  @ApiOperation({ summary: 'Revoke the current session' })
  async logout(@CurrentUser() auth: AuthContext) {
    await this.auth.logout(auth.sessionId);
    return { ok: true };
  }
}
