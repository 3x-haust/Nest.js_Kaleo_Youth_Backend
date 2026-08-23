const UNIT_MS: Record<string, number> = {
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
};

/**
 * '15m', '14d' 같은 JWT 스타일 기간 문자열을 밀리초로 바꿉니다.
 * 쿠키 maxAge와 토큰 만료를 같은 설정값 하나로 맞추기 위해 필요합니다.
 */
export function durationToMs(value: string, fallbackMs: number): number {
  const match = /^(\d+)\s*([smhd])$/.exec(value.trim());
  if (!match) {
    const asNumber = Number.parseInt(value, 10);
    return Number.isFinite(asNumber) ? asNumber * 1000 : fallbackMs;
  }
  return Number.parseInt(match[1], 10) * UNIT_MS[match[2]];
}
