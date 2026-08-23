import type { Request } from 'express';

/** Access Token에 담기는 최소 정보. 권한 판단에 필요한 값만 넣습니다. */
export interface AccessTokenPayload {
  sub: string;
  loginId: string;
  isSuperAdmin: boolean;
  authTime: number;
  iat?: number;
}

export interface RefreshTokenPayload {
  sub: string;
  jti: string;
}

export interface AuthenticatedRequest extends Request {
  admin?: AccessTokenPayload;
}
