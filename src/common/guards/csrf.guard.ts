import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { CSRF_COOKIE, CSRF_HEADER, CSRF_SAFE_METHODS } from '../constants';
import { getCookie } from '../utils/request.util';

/**
 * 전역 가드. 상태를 바꾸는 요청에만 적용됩니다.
 *
 * SameSite=Strict 쿠키가 이미 1차 방어선이지만, 브라우저·프록시 구현 차이나
 * 서브도메인 탈취 같은 우회 경로가 있어 두 겹으로 막습니다.
 * 1) Origin/Referer가 허용된 출처인지
 * 2) 헤더의 CSRF 토큰이 쿠키의 값과 일치하는지
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') return true;

    const request = context.switchToHttp().getRequest<Request>();
    if (CSRF_SAFE_METHODS.includes(request.method)) return true;

    this.assertTrustedOrigin(request);
    this.assertMatchingToken(request);
    return true;
  }

  private assertTrustedOrigin(request: Request) {
    const allowed = this.configService.get<string[]>('corsOrigins') ?? [];
    if (allowed.length === 0) return;

    const source = request.headers.origin ?? request.headers.referer;
    if (!source) {
      throw new ForbiddenException('요청 출처를 확인할 수 없습니다.');
    }

    let origin: string;
    try {
      origin = new URL(source).origin;
    } catch {
      throw new ForbiddenException('요청 출처가 올바르지 않습니다.');
    }

    if (!allowed.includes(origin)) {
      throw new ForbiddenException('허용되지 않은 출처에서의 요청입니다.');
    }
  }

  private assertMatchingToken(request: Request) {
    const cookieToken = getCookie(request, CSRF_COOKIE);
    const headerToken = request.headers[CSRF_HEADER];
    const headerValue = Array.isArray(headerToken)
      ? headerToken[0]
      : headerToken;

    if (!cookieToken || !headerValue) {
      throw new ForbiddenException('CSRF 토큰이 없습니다.');
    }

    const a = Buffer.from(cookieToken);
    const b = Buffer.from(headerValue);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new ForbiddenException('CSRF 토큰이 일치하지 않습니다.');
    }
  }
}
