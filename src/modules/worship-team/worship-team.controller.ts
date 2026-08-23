import {
  Body,
  Controller,
  Delete,
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
import type { AccessTokenPayload } from '../../common/types/authenticated-request';
import {
  CreateMemberDto,
  UpdateMemberDto,
  UpdateTeamDto,
} from './dto/worship-team.dto';
import { WorshipTeamService } from './worship-team.service';

@Controller('worship-teams')
export class WorshipTeamController {
  constructor(private readonly worshipTeamService: WorshipTeamService) {}

  @Get()
  findAll() {
    return this.worshipTeamService.findAll();
  }

  /** 공개 페이지(J-Teen 소개)에서 쓰는 대표 팀 */
  @Get('primary')
  findPrimary() {
    return this.worshipTeamService.findPrimary();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.worshipTeamService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(AdminGuard)
  updateTeam(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTeamDto,
    @CurrentAdmin() admin: AccessTokenPayload,
    @Req() request: Request,
  ) {
    return this.worshipTeamService.updateTeam(
      id,
      dto,
      { id: admin.sub, loginId: admin.loginId },
      request,
    );
  }

  @Post(':id/members')
  @UseGuards(AdminGuard)
  addMember(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateMemberDto,
    @CurrentAdmin() admin: AccessTokenPayload,
    @Req() request: Request,
  ) {
    return this.worshipTeamService.addMember(
      id,
      dto,
      { id: admin.sub, loginId: admin.loginId },
      request,
    );
  }

  @Patch('members/:memberId')
  @UseGuards(AdminGuard)
  updateMember(
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @Body() dto: UpdateMemberDto,
    @CurrentAdmin() admin: AccessTokenPayload,
    @Req() request: Request,
  ) {
    return this.worshipTeamService.updateMember(
      memberId,
      dto,
      { id: admin.sub, loginId: admin.loginId },
      request,
    );
  }

  @Delete('members/:memberId')
  @UseGuards(AdminGuard)
  removeMember(
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @CurrentAdmin() admin: AccessTokenPayload,
    @Req() request: Request,
  ) {
    return this.worshipTeamService.removeMember(
      memberId,
      { id: admin.sub, loginId: admin.loginId },
      request,
    );
  }
}
