import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../types/authenticated-request';

/**
 * AdminGuard 다음에 실행되며, 관리자 계정 관리처럼 권한이 확대되는 작업만 막습니다.
 * 반드시 AdminGuard와 함께 사용하세요 (단독으로는 인증을 검사하지 않습니다).
 */
@Injectable()
export class SuperAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (!request.admin?.isSuperAdmin) {
      throw new ForbiddenException('슈퍼관리자만 수행할 수 있는 작업입니다.');
    }
    return true;
  }
}
