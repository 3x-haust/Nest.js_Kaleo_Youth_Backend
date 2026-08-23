import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { CurrentAdmin } from '../../common/decorators/current-admin.decorator';
import { AdminGuard } from '../../common/guards/admin.guard';
import type { AccessTokenPayload } from '../../common/types/authenticated-request';
import { AttachmentOwnerType } from '../../entities';
import { UploadsService } from '../uploads/uploads.service';
import {
  CreateSetlistDto,
  PreviewPlaylistDto,
  SetlistQueryDto,
  UpdateSetlistDto,
} from './dto/setlist.dto';
import { SetlistsService } from './setlists.service';

/** 콘티/악보 자료실은 로그인 없이 전부 열람 가능하고, 등록·수정만 ADMIN입니다. */
@Controller('setlists')
export class SetlistsController {
  constructor(
    private readonly setlistsService: SetlistsService,
    private readonly uploads: UploadsService,
  ) {}

  @Get()
  findAll(@Query() query: SetlistQueryDto) {
    return this.setlistsService.findAll(query);
  }

  @Get('latest')
  findLatest() {
    return this.setlistsService.findLatest(3);
  }

  /** 관리자 화면이 임포트 UI를 띄울지 결정하기 위한 정보 (키 값 자체는 절대 노출하지 않음) */
  @Get('capabilities')
  @UseGuards(AdminGuard)
  capabilities() {
    return this.setlistsService.getCapabilities();
  }

  /**
   * 저장은 하지 않지만 유튜브 할당량을 소모하므로 ADMIN 전용입니다.
   * 계정당 분당 10회로 제한해 실수나 계정 탈취로 인한 할당량 고갈을 막습니다.
   */
  @Post('preview-playlist')
  @UseGuards(AdminGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  previewPlaylist(@Body() dto: PreviewPlaylistDto) {
    return this.setlistsService.previewPlaylist(dto.playlistUrl);
  }

  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const setlist = await this.setlistsService.findOne(id);
    const attachments = await this.uploads.findByOwner(
      AttachmentOwnerType.SETLIST,
      setlist.id,
    );
    return Object.assign(setlist, { attachments });
  }

  @Post()
  @UseGuards(AdminGuard)
  create(
    @Body() dto: CreateSetlistDto,
    @CurrentAdmin() admin: AccessTokenPayload,
    @Req() request: Request,
  ) {
    return this.setlistsService.create(
      dto,
      { id: admin.sub, loginId: admin.loginId },
      request,
    );
  }

  @Post(':id/resync')
  @UseGuards(AdminGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  resync(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAdmin() admin: AccessTokenPayload,
    @Req() request: Request,
  ) {
    return this.setlistsService.resync(
      id,
      { id: admin.sub, loginId: admin.loginId },
      request,
    );
  }

  @Patch(':id')
  @UseGuards(AdminGuard)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSetlistDto,
    @CurrentAdmin() admin: AccessTokenPayload,
    @Req() request: Request,
  ) {
    return this.setlistsService.update(
      id,
      dto,
      { id: admin.sub, loginId: admin.loginId },
      request,
    );
  }

  @Delete(':id')
  @UseGuards(AdminGuard)
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAdmin() admin: AccessTokenPayload,
    @Req() request: Request,
  ) {
    return this.setlistsService.remove(
      id,
      { id: admin.sub, loginId: admin.loginId },
      request,
    );
  }
}
