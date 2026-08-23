import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { CurrentAdmin } from '../../common/decorators/current-admin.decorator';
import { AdminGuard } from '../../common/guards/admin.guard';
import { SuperAdminGuard } from '../../common/guards/super-admin.guard';
import type { AccessTokenPayload } from '../../common/types/authenticated-request';
import { AdminsService } from './admins.service';
import {
  ChangePasswordDto,
  CreateAdminDto,
  ResetPasswordDto,
  UpdateAdminDto,
} from './dto/admin.dto';

@Controller('admin/accounts')
@UseGuards(AdminGuard)
export class AdminsController {
  constructor(private readonly adminsService: AdminsService) {}

  /** 목록 조회는 일반 ADMIN도 가능 (누가 사역자인지 확인용) */
  @Get()
  findAll() {
    return this.adminsService.findAll();
  }

  /** 본인 비밀번호 변경은 슈퍼관리자 권한이 필요 없습니다. */
  @Patch('me/password')
  changeOwnPassword(
    @Body() dto: ChangePasswordDto,
    @CurrentAdmin() admin: AccessTokenPayload,
    @Req() request: Request,
  ) {
    return this.adminsService.changeOwnPassword(admin.sub, dto, request);
  }

  @Post()
  @UseGuards(SuperAdminGuard)
  create(
    @Body() dto: CreateAdminDto,
    @CurrentAdmin() admin: AccessTokenPayload,
    @Req() request: Request,
  ) {
    return this.adminsService.create(
      dto,
      { id: admin.sub, loginId: admin.loginId },
      request,
    );
  }

  @Patch(':id')
  @UseGuards(SuperAdminGuard)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAdminDto,
    @CurrentAdmin() admin: AccessTokenPayload,
    @Req() request: Request,
  ) {
    return this.adminsService.update(
      id,
      dto,
      { id: admin.sub, loginId: admin.loginId },
      request,
    );
  }

  @Patch(':id/password')
  @UseGuards(SuperAdminGuard)
  resetPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResetPasswordDto,
    @CurrentAdmin() admin: AccessTokenPayload,
    @Req() request: Request,
  ) {
    return this.adminsService.resetPassword(
      id,
      dto,
      { id: admin.sub, loginId: admin.loginId },
      request,
    );
  }
}
