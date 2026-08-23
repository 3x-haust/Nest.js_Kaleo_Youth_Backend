import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { CurrentAdmin } from '../../common/decorators/current-admin.decorator';
import { AdminGuard } from '../../common/guards/admin.guard';
import type { AccessTokenPayload } from '../../common/types/authenticated-request';
import { AboutService } from './about.service';
import { UpdateAboutDto } from './dto/about.dto';

@Controller('about')
export class AboutController {
  constructor(private readonly aboutService: AboutService) {}

  @Get()
  find() {
    return this.aboutService.find();
  }

  @Patch()
  @UseGuards(AdminGuard)
  update(
    @Body() dto: UpdateAboutDto,
    @CurrentAdmin() admin: AccessTokenPayload,
    @Req() request: Request,
  ) {
    return this.aboutService.update(
      dto,
      { id: admin.sub, loginId: admin.loginId },
      request,
    );
  }
}
