import {
  BadRequestException,
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { IsEnum } from 'class-validator';
import { CurrentAdmin } from '../../common/decorators/current-admin.decorator';
import { AdminGuard } from '../../common/guards/admin.guard';
import { SuperAdminGuard } from '../../common/guards/super-admin.guard';
import type { AccessTokenPayload } from '../../common/types/authenticated-request';
import { AttachmentOwnerType } from '../../entities';
import { UploadsService } from './uploads.service';

class UploadBodyDto {
  @IsEnum(AttachmentOwnerType)
  ownerType: AttachmentOwnerType;
}

/** 파일 업로드는 전부 ADMIN 전용입니다. 공개 사용자는 조회만 합니다. */
@Controller('uploads')
@UseGuards(AdminGuard)
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Post()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @UseInterceptors(FilesInterceptor('files'))
  async upload(
    @UploadedFiles() files: Express.Multer.File[],
    @Body() body: UploadBodyDto,
    @CurrentAdmin() admin: AccessTokenPayload,
    @Req() request: Request,
  ) {
    if (!files || files.length === 0) {
      throw new BadRequestException('업로드할 파일이 없습니다.');
    }
    const actor = { id: admin.sub, loginId: admin.loginId };
    const saved = await this.uploadsService.registerBatch(
      files,
      body.ownerType,
      actor,
      request,
    );
    return saved.map((attachment) => ({
      id: attachment.id,
      fileUrl: attachment.fileUrl,
      originalName: attachment.originalName,
      fileType: attachment.fileType,
      fileSize: attachment.fileSize,
    }));
  }

  @Delete(':id')
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAdmin() admin: AccessTokenPayload,
  ) {
    return this.uploadsService.remove(id, admin.sub);
  }

  @Get('orphans/count')
  @UseGuards(SuperAdminGuard)
  async countOrphans() {
    return { count: await this.uploadsService.countOrphans() };
  }

  @Post('orphans/cleanup')
  @UseGuards(SuperAdminGuard)
  cleanupOrphans(
    @Query('olderThanHours', new DefaultValuePipe(24), ParseIntPipe)
    olderThanHours: number,
  ) {
    if (olderThanHours < 0 || olderThanHours > 168) {
      throw new BadRequestException(
        '고아 파일 정리 기준은 0시간부터 168시간 사이여야 합니다.',
      );
    }
    return this.uploadsService.cleanupOrphans(olderThanHours);
  }
}
