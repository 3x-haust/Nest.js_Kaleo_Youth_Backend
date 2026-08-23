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
import type { Request } from 'express';
import { CurrentAdmin } from '../../common/decorators/current-admin.decorator';
import { AdminGuard } from '../../common/guards/admin.guard';
import type { AccessTokenPayload } from '../../common/types/authenticated-request';
import {
  CreateSermonDto,
  SermonQueryDto,
  UpdateSermonDto,
} from './dto/sermon.dto';
import { SermonsService } from './sermons.service';

/**
 * 인가 규칙: 조회(GET)는 로그인 없이 누구나, 쓰기는 ADMIN만.
 */
@Controller('sermons')
export class SermonsController {
  constructor(private readonly sermonsService: SermonsService) {}

  @Get()
  findAll(@Query() query: SermonQueryDto) {
    return this.sermonsService.findAll(query);
  }

  @Get('preachers')
  findPreachers() {
    return this.sermonsService.findPreachers();
  }

  @Get('latest')
  findLatest() {
    return this.sermonsService.findLatest(3);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.sermonsService.findOne(id);
  }

  @Post()
  @UseGuards(AdminGuard)
  create(
    @Body() dto: CreateSermonDto,
    @CurrentAdmin() admin: AccessTokenPayload,
    @Req() request: Request,
  ) {
    return this.sermonsService.create(
      dto,
      { id: admin.sub, loginId: admin.loginId },
      request,
    );
  }

  @Patch(':id')
  @UseGuards(AdminGuard)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSermonDto,
    @CurrentAdmin() admin: AccessTokenPayload,
    @Req() request: Request,
  ) {
    return this.sermonsService.update(
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
    return this.sermonsService.remove(
      id,
      { id: admin.sub, loginId: admin.loginId },
      request,
    );
  }
}
