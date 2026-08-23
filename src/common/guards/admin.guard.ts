import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import { Admin } from '../../entities';
import { ACCESS_TOKEN_COOKIE } from '../constants';
import type {
  AccessTokenPayload,
  AuthenticatedRequest,
} from '../types/authenticated-request';
import { getCookie } from '../utils/request.util';

/**
 * 쓰기(POST/PUT/PATCH/DELETE) 전용 가드.
 * 읽기는 전부 공개이므로, 이 가드가 붙지 않은 라우트는 의도적으로 공개된 것입니다.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = getCookie(request, ACCESS_TOKEN_COOKIE);

    if (!token) {
      throw new UnauthorizedException('로그인이 필요합니다.');
    }

    try {
      const payload = await this.jwtService.verifyAsync<AccessTokenPayload>(
        token,
        {
          secret: this.configService.get<string>('jwt.accessSecret'),
        },
      );
      const admin = await this.dataSource.getRepository(Admin).findOne({
        where: { id: payload.sub, isActive: true },
      });
      if (!admin) throw new UnauthorizedException();
      if (
        admin.authInvalidatedAt &&
        (!Number.isFinite(payload.authTime) ||
          payload.authTime <= admin.authInvalidatedAt.getTime())
      ) {
        throw new UnauthorizedException();
      }
      request.admin = {
        sub: admin.id,
        loginId: admin.loginId,
        isSuperAdmin: admin.isSuperAdmin,
        authTime: payload.authTime,
      };
      return true;
    } catch {
      // 만료·위조를 구분해서 알려주면 공격자에게 정보를 주므로 동일하게 응답합니다.
      throw new UnauthorizedException('인증이 만료되었거나 유효하지 않습니다.');
    }
  }
}
