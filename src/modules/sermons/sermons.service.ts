import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import type { Request } from 'express';
import {
  paginate,
  type PaginatedResult,
} from '../../common/dto/pagination.dto';
import {
  sanitizePlainText,
  sanitizeRichText,
} from '../../common/utils/sanitize.util';
import { extractYoutubeVideoId } from '../../common/utils/youtube.util';
import {
  Attachment,
  AttachmentOwnerType,
  AuditAction,
  Sermon,
} from '../../entities';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { UploadsService } from '../uploads/uploads.service';
import type {
  CreateSermonDto,
  SermonQueryDto,
  UpdateSermonDto,
} from './dto/sermon.dto';

export interface ActorInfo {
  id: string;
  loginId: string;
}

@Injectable()
export class SermonsService {
  constructor(
    @InjectRepository(Sermon)
    private readonly repository: Repository<Sermon>,
    @InjectRepository(Attachment)
    private readonly attachments: Repository<Attachment>,
    private readonly dataSource: DataSource,
    private readonly uploads: UploadsService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  private youtubeVideoId(value: string | undefined): string | null {
    const normalized = sanitizePlainText(value);
    if (!normalized) return null;
    const videoId = extractYoutubeVideoId(normalized);
    if (!videoId) {
      throw new BadRequestException(
        '올바른 YouTube 영상 주소를 입력해 주세요.',
      );
    }
    return videoId;
  }

  private async attachMedia(items: Sermon[]): Promise<Sermon[]> {
    const ids = items.map((item) => item.id);
    if (ids.length === 0) return items;

    const media = await this.attachments.find({
      where: {
        ownerType: AttachmentOwnerType.SERMON,
        ownerId: In(ids),
      },
      order: { displayOrder: 'ASC', createdAt: 'ASC' },
    });
    const byOwner = new Map<string, Attachment[]>();
    for (const attachment of media) {
      if (!attachment.ownerId) continue;
      const owned = byOwner.get(attachment.ownerId) ?? [];
      owned.push(attachment);
      byOwner.set(attachment.ownerId, owned);
    }
    for (const item of items) {
      const owned = byOwner.get(item.id) ?? [];
      item.thumbnailUrl = owned[0]?.fileUrl ?? null;
      item.posterUrl = owned[1]?.fileUrl ?? item.thumbnailUrl;
      item.recentThumbnailUrl =
        owned[2]?.fileUrl ?? item.posterUrl ?? item.thumbnailUrl;
      item.attachments = owned;
    }
    return items;
  }

  async findAll(query: SermonQueryDto): Promise<PaginatedResult<Sermon>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 12;

    const builder = this.repository
      .createQueryBuilder('sermon')
      .orderBy('sermon.publishedAt', 'DESC')
      .addOrderBy('sermon.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (query.preacher) {
      builder.andWhere('sermon.preacherName = :preacher', {
        preacher: query.preacher,
      });
    }
    if (query.keyword) {
      // TypeORM 파라미터 바인딩으로만 값을 넣습니다 (SQL 인젝션 방지).
      builder.andWhere(
        '(sermon.title ILIKE :keyword OR sermon.bibleReference ILIKE :keyword OR sermon.summary ILIKE :keyword)',
        { keyword: `%${query.keyword}%` },
      );
    }
    if (query.from) {
      builder.andWhere('sermon.publishedAt >= :from', { from: query.from });
    }
    if (query.to) {
      builder.andWhere('sermon.publishedAt <= :to', { to: query.to });
    }

    const [items, total] = await builder.getManyAndCount();
    return paginate(await this.attachMedia(items), total, page, limit);
  }

  /** 설교자 필터 UI를 채우기 위한 목록 */
  async findPreachers(): Promise<string[]> {
    const rows = await this.repository
      .createQueryBuilder('sermon')
      .select('DISTINCT sermon.preacherName', 'preacherName')
      .orderBy('"preacherName"', 'ASC')
      .getRawMany<{ preacherName: string }>();
    return rows.map((row) => row.preacherName);
  }

  async findLatest(count = 3): Promise<Sermon[]> {
    const items = await this.repository.find({
      order: { publishedAt: 'DESC', createdAt: 'DESC' },
      take: count,
    });
    return this.attachMedia(items);
  }

  async findOne(id: string): Promise<Sermon> {
    const sermon = await this.repository.findOne({ where: { id } });
    if (!sermon) throw new NotFoundException('설교를 찾을 수 없습니다.');
    return (await this.attachMedia([sermon]))[0];
  }

  async create(
    dto: CreateSermonDto,
    actor: ActorInfo,
    request: Request,
  ): Promise<Sermon> {
    const saved = await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(Sermon);
      const sermon = repository.create({
        title: sanitizePlainText(dto.title) ?? '',
        preacherName: sanitizePlainText(dto.preacherName) ?? '',
        bibleReference: sanitizePlainText(dto.bibleReference),
        youtubeVideoId: this.youtubeVideoId(dto.youtubeUrl),
        summary: sanitizeRichText(dto.summary),
        publishedAt: dto.publishedAt.slice(0, 10),
        createdByAdminId: actor.id,
      });
      const created = await repository.save(sermon);
      await this.uploads.attach(
        dto.attachmentIds,
        AttachmentOwnerType.SERMON,
        created.id,
        actor.id,
        manager,
      );
      return created;
    });

    await this.auditLogs.record({
      action: AuditAction.SERMON_CREATE,
      adminId: actor.id,
      adminLoginId: actor.loginId,
      targetType: 'sermon',
      targetId: saved.id,
      detail: saved.title,
      request,
    });
    return saved;
  }

  async update(
    id: string,
    dto: UpdateSermonDto,
    actor: ActorInfo,
    request: Request,
  ): Promise<Sermon> {
    const sermon = await this.findOne(id);

    if (dto.title !== undefined)
      sermon.title = sanitizePlainText(dto.title) ?? sermon.title;
    if (dto.preacherName !== undefined)
      sermon.preacherName =
        sanitizePlainText(dto.preacherName) ?? sermon.preacherName;
    if (dto.bibleReference !== undefined)
      sermon.bibleReference = sanitizePlainText(dto.bibleReference);
    if (dto.youtubeUrl !== undefined)
      sermon.youtubeVideoId = this.youtubeVideoId(dto.youtubeUrl);
    if (dto.summary !== undefined)
      sermon.summary = sanitizeRichText(dto.summary);
    if (dto.publishedAt !== undefined)
      sermon.publishedAt = dto.publishedAt.slice(0, 10);

    const saved = await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(Sermon);
      const updated = await repository.save(sermon);
      await this.uploads.attach(
        dto.attachmentIds,
        AttachmentOwnerType.SERMON,
        updated.id,
        actor.id,
        manager,
      );
      return updated;
    });
    await this.auditLogs.record({
      action: AuditAction.SERMON_UPDATE,
      adminId: actor.id,
      adminLoginId: actor.loginId,
      targetType: 'sermon',
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
    const sermon = await this.findOne(id);
    const fileUrls = await this.dataSource.transaction(async (manager) => {
      const urls = await this.uploads.removeByOwner(
        AttachmentOwnerType.SERMON,
        sermon.id,
        manager,
      );
      await manager.getRepository(Sermon).remove(sermon);
      return urls;
    });
    await this.uploads.deleteFiles(fileUrls);
    await this.auditLogs.record({
      action: AuditAction.SERMON_DELETE,
      adminId: actor.id,
      adminLoginId: actor.loginId,
      targetType: 'sermon',
      targetId: id,
      detail: sermon.title,
      request,
    });
    return { success: true };
  }
}
