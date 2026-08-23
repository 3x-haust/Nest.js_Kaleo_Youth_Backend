import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminGuard } from '../../common/guards/admin.guard';
import { SuperAdminGuard } from '../../common/guards/super-admin.guard';
import { Admin, RefreshToken } from '../../entities';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

/**
 * AdminGuard는 거의 모든 모듈의 쓰기 라우트에서 쓰이므로,
 * 각 모듈이 JwtModule을 중복 import 하지 않도록 전역으로 공개합니다.
 */
@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([Admin, RefreshToken]),
    JwtModule.register({}),
  ],
  controllers: [AuthController],
  providers: [AuthService, AdminGuard, SuperAdminGuard],
  exports: [AuthService, AdminGuard, SuperAdminGuard, JwtModule],
})
export class AuthModule {}
