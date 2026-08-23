import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { CSRF_COOKIE } from '../../common/constants';
import { CurrentAdmin } from '../../common/decorators/current-admin.decorator';
import { AdminGuard } from '../../common/guards/admin.guard';
import type { AccessTokenPayload } from '../../common/types/authenticated-request';
import { getCookie } from '../../common/utils/request.util';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';

/**
 * 공개 회원가입 엔드포인트는 존재하지 않습니다.
 * 새 관리자 계정 생성은 /api/admin/accounts (슈퍼관리자 전용)에서만 가능합니다.
 */
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * 로그인 폼을 띄우기 전에 호출해 CSRF 토큰 쿠키를 받아갑니다.
   * (쿠키 자체는 CsrfMiddleware가 모든 응답에 심으므로, 이 엔드포인트는 값을 알려주는 역할)
   */
  @Get('csrf')
  issueCsrf(@Req() request: Request) {
    return { csrfToken: getCookie(request, CSRF_COOKIE) };
  }

  /** 무차별 대입을 막기 위해 로그인만 별도의 강한 제한을 겁니다. */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.authService.login(dto, request, response);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.authService.refresh(request, response);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.authService.logout(request, response);
  }

  /** 프론트가 새로고침 후 현재 로그인 상태를 확인하는 용도 */
  @Get('me')
  @UseGuards(AdminGuard)
  me(@CurrentAdmin() admin?: AccessTokenPayload) {
    if (!admin) throw new UnauthorizedException();
    return this.authService.getProfile(admin.sub);
  }
}
