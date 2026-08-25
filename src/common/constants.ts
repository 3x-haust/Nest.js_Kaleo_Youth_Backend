/** 모든 API 라우트에 붙는 전역 prefix */
export const API_PREFIX = 'api';

export const ACCESS_TOKEN_COOKIE = 'kaleo_at';
export const REFRESH_TOKEN_COOKIE = 'kaleo_rt';

/**
 * Refresh Token 쿠키는 재발급/로그아웃 경로에서만 전송되도록 범위를 좁힙니다.
 * 일반 API 요청마다 장기 토큰이 네트워크를 오가지 않게 하기 위함입니다.
 */
export const REFRESH_TOKEN_COOKIE_PATH = '/';
export const LEGACY_REFRESH_TOKEN_COOKIE_PATH = `/${API_PREFIX}/auth`;

/**
 * CSRF Double Submit Cookie 패턴에 쓰이는 쌍.
 * 쿠키는 httpOnly가 아니어야 프론트 JS가 읽어 헤더로 되돌려 보낼 수 있습니다.
 * 토큰 값 자체는 비밀이 아니며, "같은 출처의 스크립트만 쿠키를 읽을 수 있다"는
 * 브라우저의 동일 출처 정책이 보호 근거입니다.
 */
export const CSRF_COOKIE = 'kaleo_csrf';
export const CSRF_HEADER = 'x-csrf-token';

/** 상태를 바꾸지 않는 메서드는 CSRF 검사에서 제외합니다. */
export const CSRF_SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS'];
