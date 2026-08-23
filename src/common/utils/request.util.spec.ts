import type { Request } from 'express';
import { getClientIp } from './request.util';

describe('getClientIp', () => {
  it('uses the address resolved by Express instead of trusting a raw forwarded header', () => {
    const request = {
      headers: { 'x-forwarded-for': '203.0.113.55' },
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' },
    } satisfies {
      ip?: string;
      socket: { remoteAddress?: string | null };
      headers: Record<string, string>;
    };

    expect(getClientIp(request)).toBe('127.0.0.1');
  });
});
