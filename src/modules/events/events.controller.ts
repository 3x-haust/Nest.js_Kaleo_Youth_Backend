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
import { CreateEventDto, EventQueryDto, UpdateEventDto } from './dto/event.dto';
import { EventsService } from './events.service';

@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Get()
  findAll(@Query() query: EventQueryDto) {
    return this.eventsService.findAll(query);
  }

  @Get('upcoming')
  findUpcoming() {
    return this.eventsService.findUpcoming(3);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.eventsService.findOne(id);
  }

  @Post()
  @UseGuards(AdminGuard)
  create(
    @Body() dto: CreateEventDto,
    @CurrentAdmin() admin: AccessTokenPayload,
    @Req() request: Request,
  ) {
    return this.eventsService.create(
      dto,
      { id: admin.sub, loginId: admin.loginId },
      request,
    );
  }

  @Patch(':id')
  @UseGuards(AdminGuard)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEventDto,
    @CurrentAdmin() admin: AccessTokenPayload,
    @Req() request: Request,
  ) {
    return this.eventsService.update(
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
    return this.eventsService.remove(
      id,
      { id: admin.sub, loginId: admin.loginId },
      request,
    );
  }
}
