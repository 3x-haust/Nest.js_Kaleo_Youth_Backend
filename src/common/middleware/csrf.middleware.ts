import { Injectable, NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { CSRF_COOKIE } from '../constants';

/**
 * Double Submit Cookie 패턴의 절반: 브라우저에 CSRF 토큰 쿠키를 심습니다.
 * 이 쿠키만은 httpOnly가 아닙니다 — 프론트 스크립트가 값을 읽어
 * 요청 헤더에 되돌려 넣어야 검증이 성립하기 때문입니다.
 */
@Injectable()
export class CsrfMiddleware implements NestMiddleware {
  constructor(private readonly configService: ConfigService) {}

  use(req: Request, res: Response, next: NextFunction) {
    if (!req.cookies?.[CSRF_COOKIE]) {
      const token = randomBytes(32).toString('hex');
      res.cookie(CSRF_COOKIE, token, {
        httpOnly: false,
        secure: this.configService.get<boolean>('cookie.secure') ?? false,
        sameSite: 'strict',
        domain: this.configService.get<string>('cookie.domain'),
        path: '/',
        maxAge: 1000 * 60 * 60 * 12,
      });
      // 같은 요청 안에서 이어지는 가드가 새 값을 볼 수 있도록 즉시 반영합니다.
      req.cookies = { ...(req.cookies ?? {}), [CSRF_COOKIE]: token };
    }
    next();
  }
}
