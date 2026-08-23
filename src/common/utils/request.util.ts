import type { Request } from 'express';

export function getCookie(request: Request, name: string): string | null {
  const cookies: unknown = request.cookies;
  if (!cookies || typeof cookies !== 'object') return null;
  const value = (cookies as Record<string, unknown>)[name];
  return typeof value === 'string' ? value : null;
}

/** Express가 구성된 프록시 홉 수를 적용해 계산한 클라이언트 IP를 사용합니다. */
export function getClientIp(request: {
  ip?: string;
  socket: { remoteAddress?: string | null };
}): string | null {
  return (
    (request.ip ?? request.socket?.remoteAddress ?? null)?.slice(0, 64) ?? null
  );
}

export function getUserAgent(request: Request): string | null {
  const ua = request.headers['user-agent'];
  return typeof ua === 'string' ? ua.slice(0, 512) : null;
}
