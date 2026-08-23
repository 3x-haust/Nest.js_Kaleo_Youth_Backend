import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post as HttpPost,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { CurrentAdmin } from '../../common/decorators/current-admin.decorator';
import { AdminGuard } from '../../common/guards/admin.guard';
import type { AccessTokenPayload } from '../../common/types/authenticated-request';
import { CreatePostDto, PostQueryDto, UpdatePostDto } from './dto/post.dto';
import { PostsService } from './posts.service';

@Controller('posts')
export class PostsController {
  constructor(private readonly postsService: PostsService) {}

  @Get()
  findAll(@Query() query: PostQueryDto) {
    return this.postsService.findAll(query);
  }

  @Get('latest/notices')
  latestNotices() {
    return this.postsService.findLatestNotices(4);
  }

  @Get('latest/gallery')
  latestGallery() {
    return this.postsService.findLatestGallery(6);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.postsService.findOne(id);
  }

  @HttpPost()
  @UseGuards(AdminGuard)
  create(
    @Body() dto: CreatePostDto,
    @CurrentAdmin() admin: AccessTokenPayload,
    @Req() request: Request,
  ) {
    return this.postsService.create(
      dto,
      { id: admin.sub, loginId: admin.loginId },
      request,
    );
  }

  @Patch(':id')
  @UseGuards(AdminGuard)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePostDto,
    @CurrentAdmin() admin: AccessTokenPayload,
    @Req() request: Request,
  ) {
    return this.postsService.update(
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
    return this.postsService.remove(
      id,
      { id: admin.sub, loginId: admin.loginId },
      request,
    );
  }
}
