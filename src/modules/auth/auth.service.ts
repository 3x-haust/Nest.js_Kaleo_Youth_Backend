import {
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { verify as verifyPassword } from '@node-rs/argon2';
import { createHash, randomUUID } from 'node:crypto';
import { IsNull, Repository } from 'typeorm';
import type { CookieOptions, Request, Response } from 'express';
import {
  ACCESS_TOKEN_COOKIE,
  CSRF_COOKIE,
  LEGACY_REFRESH_TOKEN_COOKIE_PATH,
  REFRESH_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE_PATH,
} from '../../common/constants';
import { durationToMs } from '../../common/utils/duration.util';
import {
  getClientIp,
  getCookie,
  getUserAgent,
} from '../../common/utils/request.util';
import type {
  AccessTokenPayload,
  RefreshTokenPayload,
} from '../../common/types/authenticated-request';
import { Admin, AuditAction, RefreshToken } from '../../entities';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { LoginDto } from './dto/login.dto';

/** jsonwebtoken 의 expiresIn 타입 (문자열 리터럴 유니온 또는 초 단위 숫자) */
type JwtExpiresIn = Parameters<JwtService['signAsync']>[1] extends infer O
  ? O extends { expiresIn?: infer E }
    ? E
    : never
  : never;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(Admin)
    private readonly adminRepository: Repository<Admin>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepository: Repository<RefreshToken>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  async login(dto: LoginDto, request: Request, response: Response) {
    const admin = await this.adminRepository
      .createQueryBuilder('admin')
      .addSelect('admin.passwordHash')
      .where('admin.loginId = :loginId', { loginId: dto.loginId })
      .getOne();

    // 아이디가 없는 경우와 비밀번호가 틀린 경우를 구분해 알려주면
    // 유효한 관리자 아이디를 열거할 수 있게 되므로 동일한 메시지로 응답합니다.
    const invalid = () =>
      new UnauthorizedException('아이디 또는 비밀번호가 올바르지 않습니다.');

    if (!admin) {
      await this.auditLogsService.record({
        action: AuditAction.LOGIN_FAIL,
        adminLoginId: dto.loginId,
        detail: '존재하지 않는 아이디',
        request,
      });
      throw invalid();
    }

    const passwordMatches = await verifyPassword(
      admin.passwordHash,
      dto.password,
    ).catch(() => false);

    if (!passwordMatches) {
      await this.auditLogsService.record({
        action: AuditAction.LOGIN_FAIL,
        adminId: admin.id,
        adminLoginId: admin.loginId,
        detail: '비밀번호 불일치',
        request,
      });
      throw invalid();
    }

    if (!admin.isActive) {
      await this.auditLogsService.record({
        action: AuditAction.LOGIN_FAIL,
        adminId: admin.id,
        adminLoginId: admin.loginId,
        detail: '비활성화된 계정',
        request,
      });
      throw new ForbiddenException(
        '비활성화된 계정입니다. 담당자에게 문의해주세요.',
      );
    }

    await this.issueSession(admin, request, response);
    await this.adminRepository.update(admin.id, { lastLoginAt: new Date() });

    await this.auditLogsService.record({
      action: AuditAction.LOGIN_SUCCESS,
      adminId: admin.id,
      adminLoginId: admin.loginId,
      request,
    });

    return this.toProfile(admin);
  }

  async refresh(request: Request, response: Response) {
    const rawToken = getCookie(request, REFRESH_TOKEN_COOKIE);
    if (!rawToken) {
      throw new UnauthorizedException(
        '세션이 만료되었습니다. 다시 로그인해주세요.',
      );
    }

    let payload: RefreshTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<RefreshTokenPayload>(
        rawToken,
        {
          secret: this.configService.get<string>('jwt.refreshSecret'),
        },
      );
    } catch {
      this.clearAuthCookies(response);
      throw new UnauthorizedException(
        '세션이 만료되었습니다. 다시 로그인해주세요.',
      );
    }

    const stored = await this.refreshTokenRepository.findOne({
      where: { tokenHash: this.hashToken(rawToken) },
    });

    if (!stored) {
      this.clearAuthCookies(response);
      throw new UnauthorizedException(
        '세션이 만료되었습니다. 다시 로그인해주세요.',
      );
    }

    // 이미 회전으로 폐기된 토큰이 다시 들어온 경우: 동시 탭 갱신처럼
    // 정상적인 경쟁 상황일 수 있으므로 조용히 401로 끝냅니다.
    // 쿠키를 지우지 않는 이유: 같은 출처의 승자 탭이 방금 받은 새 쿠키를
    // 함께 지워버리면 안 되기 때문입니다.
    if (stored.revokedAt && stored.replacedByTokenId) {
      throw new UnauthorizedException(
        '세션이 이미 갱신되었습니다. 다시 로그인해주세요.',
      );
    }

    // 폐기된 토큰이 회전 기록 없이 다시 들어왔다는 것은 누군가 예전 토큰을
    // 손에 넣었다는 뜻입니다. 어느 쪽이 공격자인지 알 수 없으므로
    // 해당 관리자의 모든 세션을 끊습니다.
    if (stored.revokedAt) {
      await this.revokeAllSessions(stored.adminId);
      this.clearAuthCookies(response);
      await this.auditLogsService.record({
        action: AuditAction.TOKEN_REUSE_DETECTED,
        adminId: stored.adminId,
        detail: '폐기된 Refresh Token 재사용 감지 — 전체 세션 강제 종료',
        request,
      });
      this.logger.warn(`Refresh Token 재사용 감지: adminId=${stored.adminId}`);
      throw new UnauthorizedException(
        '보안을 위해 로그아웃되었습니다. 다시 로그인해주세요.',
      );
    }

    if (stored.expiresAt.getTime() <= Date.now()) {
      this.clearAuthCookies(response);
      throw new UnauthorizedException(
        '세션이 만료되었습니다. 다시 로그인해주세요.',
      );
    }

    const admin = await this.adminRepository.findOne({
      where: { id: payload.sub },
    });
    if (!admin || !admin.isActive) {
      await this.revokeAllSessions(payload.sub);
      this.clearAuthCookies(response);
      throw new UnauthorizedException('사용할 수 없는 계정입니다.');
    }

    const next = await this.issueSession(admin, request, response);
    const rotated = await this.refreshTokenRepository.update(
      { id: stored.id, revokedAt: IsNull() },
      {
        revokedAt: new Date(),
        replacedByTokenId: next.refreshTokenId,
      },
    );
    if (rotated.affected !== 1) {
      await this.refreshTokenRepository.delete(next.refreshTokenId);
      this.clearAuthCookies(response);
      throw new UnauthorizedException(
        '세션이 이미 갱신되었습니다. 다시 로그인해주세요.',
      );
    }

    await this.auditLogsService.record({
      action: AuditAction.TOKEN_REFRESH,
      adminId: admin.id,
      adminLoginId: admin.loginId,
      request,
    });

    return this.toProfile(admin);
  }

  async logout(request: Request, response: Response) {
    const rawToken = getCookie(request, REFRESH_TOKEN_COOKIE);

    if (rawToken) {
      const stored = await this.refreshTokenRepository.findOne({
        where: { tokenHash: this.hashToken(rawToken), revokedAt: IsNull() },
      });
      if (stored) {
        await this.refreshTokenRepository.update(stored.id, {
          revokedAt: new Date(),
        });
        await this.auditLogsService.record({
          action: AuditAction.LOGOUT,
          adminId: stored.adminId,
          request,
        });
      }
    }

    this.clearAuthCookies(response);
    return { message: '로그아웃되었습니다.' };
  }

  async getProfile(adminId: string) {
    const admin = await this.adminRepository.findOne({
      where: { id: adminId },
    });
    if (!admin || !admin.isActive) {
      throw new UnauthorizedException('사용할 수 없는 계정입니다.');
    }
    return this.toProfile(admin);
  }

  async revokeAllSessions(adminId: string) {
    await this.refreshTokenRepository.update(
      { adminId, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }

  // ── 내부 헬퍼 ───────────────────────────────────────────

  private async issueSession(
    admin: Admin,
    request: Request,
    response: Response,
  ) {
    const accessTtl = this.configService.get<string>('jwt.accessTtl') ?? '15m';
    const refreshTtl =
      this.configService.get<string>('jwt.refreshTtl') ?? '14d';
    const refreshTtlMs = durationToMs(refreshTtl, 14 * 24 * 60 * 60 * 1000);

    const refreshTokenId = randomUUID();

    const accessPayload: AccessTokenPayload = {
      sub: admin.id,
      loginId: admin.loginId,
      isSuperAdmin: admin.isSuperAdmin,
      authTime: Date.now(),
    };

    const accessToken = await this.jwtService.signAsync(accessPayload, {
      secret: this.configService.get<string>('jwt.accessSecret'),
      // jsonwebtoken 타입은 '15m' 같은 리터럴 유니온을 요구하지만 값은 설정에서 옵니다.
      expiresIn: accessTtl as JwtExpiresIn,
    });

    const refreshToken = await this.jwtService.signAsync(
      { sub: admin.id, jti: refreshTokenId } satisfies RefreshTokenPayload,
      {
        secret: this.configService.get<string>('jwt.refreshSecret'),
        expiresIn: refreshTtl as JwtExpiresIn,
      },
    );

    await this.refreshTokenRepository.save(
      this.refreshTokenRepository.create({
        id: refreshTokenId,
        adminId: admin.id,
        tokenHash: this.hashToken(refreshToken),
        expiresAt: new Date(Date.now() + refreshTtlMs),
        ipAddress: getClientIp(request),
        userAgent: getUserAgent(request),
        deviceInfo: getUserAgent(request)?.slice(0, 255) ?? null,
      }),
    );

    const accessTtlMs = durationToMs(accessTtl, 15 * 60 * 1000);
    response.cookie(
      ACCESS_TOKEN_COOKIE,
      accessToken,
      this.cookieOptions(accessTtlMs),
    );
    response.clearCookie(REFRESH_TOKEN_COOKIE, {
      ...this.cookieOptions(0),
      path: LEGACY_REFRESH_TOKEN_COOKIE_PATH,
    });
    response.cookie(REFRESH_TOKEN_COOKIE, refreshToken, {
      ...this.cookieOptions(refreshTtlMs),
      path: REFRESH_TOKEN_COOKIE_PATH,
    });

    return { refreshTokenId };
  }

  private cookieOptions(maxAgeMs: number): CookieOptions {
    return {
      httpOnly: true,
      secure: this.configService.get<boolean>('cookie.secure') ?? false,
      sameSite: 'strict',
      domain: this.configService.get<string>('cookie.domain'),
      path: '/',
      maxAge: maxAgeMs,
    };
  }

  private clearAuthCookies(response: Response) {
    const base = {
      httpOnly: true,
      secure: this.configService.get<boolean>('cookie.secure') ?? false,
      sameSite: 'strict' as const,
      domain: this.configService.get<string>('cookie.domain'),
    };
    response.clearCookie(ACCESS_TOKEN_COOKIE, { ...base, path: '/' });
    response.clearCookie(REFRESH_TOKEN_COOKIE, {
      ...base,
      path: REFRESH_TOKEN_COOKIE_PATH,
    });
    response.clearCookie(REFRESH_TOKEN_COOKIE, {
      ...base,
      path: LEGACY_REFRESH_TOKEN_COOKIE_PATH,
    });
    response.clearCookie(CSRF_COOKIE, { ...base, httpOnly: false, path: '/' });
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private toProfile(admin: Admin) {
    return {
      id: admin.id,
      loginId: admin.loginId,
      name: admin.name,
      positionLabel: admin.positionLabel,
      isSuperAdmin: admin.isSuperAdmin,
    };
  }
}
