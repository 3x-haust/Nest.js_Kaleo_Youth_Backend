import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import type { Request } from 'express';
import {
  paginate,
  type PaginatedResult,
} from '../../common/dto/pagination.dto';
import {
  sanitizePlainText,
  sanitizeRichText,
} from '../../common/utils/sanitize.util';
import { AttachmentOwnerType, AuditAction, ChurchEvent } from '../../entities';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { UploadsService } from '../uploads/uploads.service';
import type { ActorInfo } from '../sermons/sermons.service';
import type {
  CreateEventDto,
  EventQueryDto,
  UpdateEventDto,
} from './dto/event.dto';

const seoulCalendarDate = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

@Injectable()
export class EventsService {
  constructor(
    @InjectRepository(ChurchEvent)
    private readonly repository: Repository<ChurchEvent>,
    private readonly dataSource: DataSource,
    private readonly auditLogs: AuditLogsService,
    private readonly uploads: UploadsService,
  ) {}

  async findAll(query: EventQueryDto): Promise<PaginatedResult<ChurchEvent>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 12;
    const scope = query.scope ?? 'all';

    const builder = this.repository
      .createQueryBuilder('event')
      .skip((page - 1) * limit)
      .take(limit);

    if (scope === 'upcoming') {
      builder
        .andWhere('COALESCE(event.endDate, event.startDate) >= :today', {
          today: seoulCalendarDate(),
        })
        .orderBy('event.startDate', 'ASC');
    } else if (scope === 'past') {
      builder
        .andWhere('COALESCE(event.endDate, event.startDate) < :today', {
          today: seoulCalendarDate(),
        })
        .orderBy('event.startDate', 'DESC');
    } else {
      builder.orderBy('event.startDate', 'DESC');
    }

    if (query.keyword) {
      builder.andWhere(
        '(event.title ILIKE :keyword OR event.description ILIKE :keyword)',
        {
          keyword: `%${query.keyword}%`,
        },
      );
    }

    const [items, total] = await builder.getManyAndCount();
    return paginate(items, total, page, limit);
  }

  async findUpcoming(count = 3): Promise<ChurchEvent[]> {
    return this.repository
      .createQueryBuilder('event')
      .where('COALESCE(event.endDate, event.startDate) >= :today', {
        today: seoulCalendarDate(),
      })
      .orderBy('event.startDate', 'ASC')
      .take(count)
      .getMany();
  }

  async findOne(id: string): Promise<ChurchEvent> {
    const event = await this.repository.findOne({ where: { id } });
    if (!event) throw new NotFoundException('행사를 찾을 수 없습니다.');
    return event;
  }

  async create(
    dto: CreateEventDto,
    actor: ActorInfo,
    request: Request,
  ): Promise<ChurchEvent> {
    this.assertDateRange(dto.startDate, dto.endDate);
    if (dto.startDate.slice(0, 10) < seoulCalendarDate()) {
      throw new BadRequestException('시작일은 오늘보다 앞설 수 없습니다.');
    }

    const saved = await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(ChurchEvent);
      const event = repository.create({
        title: sanitizePlainText(dto.title) ?? '',
        description: sanitizeRichText(dto.description),
        startDate: dto.startDate.slice(0, 10),
        endDate: dto.endDate ? dto.endDate.slice(0, 10) : null,
        location: sanitizePlainText(dto.location),
        itemsToBring: sanitizeRichText(dto.itemsToBring),
        feeInfo: sanitizePlainText(dto.feeInfo),
        contactInfo: sanitizePlainText(dto.contactInfo),
        coverImageUrl: dto.coverImageUrl ?? null,
        createdByAdminId: actor.id,
      });
      const created = await repository.save(event);
      await this.uploads.attach(
        dto.attachmentIds,
        AttachmentOwnerType.EVENT,
        created.id,
        actor.id,
        manager,
      );
      return created;
    });

    await this.auditLogs.record({
      action: AuditAction.EVENT_CREATE,
      adminId: actor.id,
      adminLoginId: actor.loginId,
      targetType: 'event',
      targetId: saved.id,
      detail: saved.title,
      request,
    });
    return saved;
  }

  async update(
    id: string,
    dto: UpdateEventDto,
    actor: ActorInfo,
    request: Request,
  ): Promise<ChurchEvent> {
    const event = await this.findOne(id);
    this.assertDateRange(
      dto.startDate ?? event.startDate,
      dto.endDate ?? event.endDate ?? undefined,
    );

    if (dto.title !== undefined)
      event.title = sanitizePlainText(dto.title) ?? event.title;
    if (dto.description !== undefined)
      event.description = sanitizeRichText(dto.description);
    if (dto.startDate !== undefined)
      event.startDate = dto.startDate.slice(0, 10);
    if (dto.endDate !== undefined)
      event.endDate = dto.endDate ? dto.endDate.slice(0, 10) : null;
    if (dto.location !== undefined)
      event.location = sanitizePlainText(dto.location);
    if (dto.itemsToBring !== undefined)
      event.itemsToBring = sanitizeRichText(dto.itemsToBring);
    if (dto.feeInfo !== undefined)
      event.feeInfo = sanitizePlainText(dto.feeInfo);
    if (dto.contactInfo !== undefined)
      event.contactInfo = sanitizePlainText(dto.contactInfo);
    if (dto.coverImageUrl !== undefined)
      event.coverImageUrl = dto.coverImageUrl || null;

    const saved = await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(ChurchEvent);
      const updated = await repository.save(event);
      await this.uploads.attach(
        dto.attachmentIds,
        AttachmentOwnerType.EVENT,
        updated.id,
        actor.id,
        manager,
      );
      return updated;
    });
    await this.auditLogs.record({
      action: AuditAction.EVENT_UPDATE,
      adminId: actor.id,
      adminLoginId: actor.loginId,
      targetType: 'event',
      targetId: saved.id,
      detail: saved.title,
      request,
    });
    return saved;
  }

  async remove(
    id: string,
    actor: ActorInfo,
    request: Request,
  ): Promise<{ success: true }> {
    const event = await this.findOne(id);
    const fileUrls = await this.dataSource.transaction(async (manager) => {
      const urls = await this.uploads.removeByOwner(
        AttachmentOwnerType.EVENT,
        event.id,
        manager,
      );
      await manager.getRepository(ChurchEvent).remove(event);
      return urls;
    });
    await this.uploads.deleteFiles(fileUrls);
    await this.auditLogs.record({
      action: AuditAction.EVENT_DELETE,
      adminId: actor.id,
      adminLoginId: actor.loginId,
      targetType: 'event',
      targetId: id,
      detail: event.title,
      request,
    });
    return { success: true };
  }

  private assertDateRange(startDate: string, endDate?: string | null) {
    if (endDate && endDate.slice(0, 10) < startDate.slice(0, 10)) {
      throw new BadRequestException('종료일은 시작일보다 앞설 수 없습니다.');
    }
  }
}
