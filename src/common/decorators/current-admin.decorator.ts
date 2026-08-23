import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type {
  AccessTokenPayload,
  AuthenticatedRequest,
} from '../types/authenticated-request';

/** AdminGuard가 통과시킨 요청에서만 값이 존재합니다. */
export const CurrentAdmin = createParamDecorator(
  (
    _data: unknown,
    context: ExecutionContext,
  ): AccessTokenPayload | undefined => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    return request.admin;
  },
);
