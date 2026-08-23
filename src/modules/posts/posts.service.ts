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
import {
  Attachment,
  AttachmentOwnerType,
  AuditAction,
  BoardType,
  Post,
} from '../../entities';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import type { ActorInfo } from '../sermons/sermons.service';
import { UploadsService } from '../uploads/uploads.service';
import type {
  CreatePostDto,
  PostQueryDto,
  UpdatePostDto,
} from './dto/post.dto';

export type PostWithAttachments = Post & { attachments: Attachment[] };

@Injectable()
export class PostsService {
  constructor(
    @InjectRepository(Post)
    private readonly repository: Repository<Post>,
    private readonly dataSource: DataSource,
    private readonly uploads: UploadsService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  async findAll(
    query: PostQueryDto,
  ): Promise<PaginatedResult<PostWithAttachments>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 12;

    const builder = this.repository
      .createQueryBuilder('post')
      .skip((page - 1) * limit)
      .take(limit);

    if (query.boardType === BoardType.GALLERY) {
      builder
        .orderBy('post.startDate', 'DESC', 'NULLS LAST')
        .addOrderBy('post.createdAt', 'DESC');
    } else {
      builder
        .orderBy('post.isPinned', 'DESC')
        .addOrderBy('post.createdAt', 'DESC');
    }

    if (query.boardType) {
      builder.andWhere('post.boardType = :boardType', {
        boardType: query.boardType,
      });
    }
    if (query.keyword) {
      builder.andWhere(
        '(post.title ILIKE :keyword OR post.content ILIKE :keyword)',
        {
          keyword: `%${query.keyword}%`,
        },
      );
    }

    const [items, total] = await builder.getManyAndCount();
    const attachmentMap = await this.uploads.findManyByOwners(
      AttachmentOwnerType.POST,
      items.map((item) => item.id),
    );
    const withAttachments = items.map((item) =>
      Object.assign(item, { attachments: attachmentMap.get(item.id) ?? [] }),
    );

    return paginate(withAttachments, total, page, limit);
  }

  async findLatestNotices(count = 4): Promise<Post[]> {
    return this.repository.find({
      where: { boardType: BoardType.NOTICE },
      order: { isPinned: 'DESC', createdAt: 'DESC' },
      take: count,
    });
  }

  async findLatestGallery(count = 6): Promise<Post[]> {
    return this.repository
      .createQueryBuilder('post')
      .where('post.boardType = :boardType', {
        boardType: BoardType.GALLERY,
      })
      .orderBy('post.startDate', 'DESC', 'NULLS LAST')
      .addOrderBy('post.createdAt', 'DESC')
      .take(count)
      .getMany();
  }

  async findOne(id: string): Promise<PostWithAttachments> {
    const post = await this.repository.findOne({ where: { id } });
    if (!post) throw new NotFoundException('게시글을 찾을 수 없습니다.');
    const attachments = await this.uploads.findByOwner(
      AttachmentOwnerType.POST,
      post.id,
    );
    return Object.assign(post, { attachments });
  }

  async create(
    dto: CreatePostDto,
    actor: ActorInfo,
    request: Request,
  ): Promise<Post> {
    const dates = this.galleryDatesForCreate(dto);
    const saved = await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(Post);
      const post = repository.create({
        boardType: dto.boardType,
        title: sanitizePlainText(dto.title) ?? '',
        content: sanitizeRichText(dto.content),
        thumbnailUrl: dto.thumbnailUrl ?? null,
        startDate: dates.startDate,
        endDate: dates.endDate,
        isPinned: dto.isPinned ?? false,
        authorAdminId: actor.id,
      });
      const created = await repository.save(post);
      await this.uploads.attach(
        dto.attachmentIds,
        AttachmentOwnerType.POST,
        created.id,
        actor.id,
        manager,
      );

      if (!created.thumbnailUrl && dto.boardType === BoardType.GALLERY) {
        const attachments = await manager.getRepository(Attachment).find({
          where: { ownerType: AttachmentOwnerType.POST, ownerId: created.id },
          order: { displayOrder: 'ASC', createdAt: 'ASC' },
        });
        const firstImage = attachments.find((item) =>
          item.fileType?.startsWith('image/'),
        );
        if (firstImage) {
          created.thumbnailUrl = firstImage.fileUrl;
          await repository.save(created);
        }
      }
      return created;
    });

    await this.auditLogs.record({
      action: AuditAction.POST_CREATE,
      adminId: actor.id,
      adminLoginId: actor.loginId,
      targetType: 'post',
      targetId: saved.id,
      detail: `[${saved.boardType}] ${saved.title}`,
      request,
    });
    return saved;
  }

  async update(
    id: string,
    dto: UpdatePostDto,
    actor: ActorInfo,
    request: Request,
  ): Promise<Post> {
    const post = await this.repository.findOne({ where: { id } });
    if (!post) throw new NotFoundException('게시글을 찾을 수 없습니다.');

    if (dto.boardType !== undefined && dto.boardType !== post.boardType) {
      throw new BadRequestException(
        '게시판 종류는 변경할 수 없습니다. 새 글로 작성해 주세요.',
      );
    }
    if (dto.title !== undefined)
      post.title = sanitizePlainText(dto.title) ?? post.title;
    if (dto.content !== undefined) post.content = sanitizeRichText(dto.content);
    if (dto.thumbnailUrl !== undefined)
      post.thumbnailUrl = dto.thumbnailUrl || null;
    this.applyGalleryDateUpdate(post, dto);
    if (dto.isPinned !== undefined) post.isPinned = dto.isPinned;

    const saved = await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(Post);
      const updated = await repository.save(post);
      await this.uploads.attach(
        dto.attachmentIds,
        AttachmentOwnerType.POST,
        updated.id,
        actor.id,
        manager,
      );
      return updated;
    });

    await this.auditLogs.record({
      action: AuditAction.POST_UPDATE,
      adminId: actor.id,
      adminLoginId: actor.loginId,
      targetType: 'post',
      targetId: saved.id,
      detail: `[${saved.boardType}] ${saved.title}`,
      request,
    });
    return saved;
  }

  private galleryDatesForCreate(dto: CreatePostDto): {
    startDate: string | null;
    endDate: string | null;
  } {
    if (dto.boardType !== BoardType.GALLERY) {
      if (dto.startDate !== undefined || dto.endDate !== undefined) {
        throw new BadRequestException(
          '갤러리 날짜는 갤러리 게시글에만 입력할 수 있습니다.',
        );
      }
      return { startDate: null, endDate: null };
    }

    const startDate = dto.startDate?.slice(0, 10) ?? null;
    if (!startDate) {
      throw new BadRequestException('갤러리 시작일을 입력해 주세요.');
    }
    const endDate = dto.endDate ? dto.endDate.slice(0, 10) : null;
    this.assertDateRange(startDate, endDate);
    return { startDate, endDate };
  }

  private applyGalleryDateUpdate(post: Post, dto: UpdatePostDto): void {
    if (post.boardType !== BoardType.GALLERY) {
      if (dto.startDate !== undefined || dto.endDate !== undefined) {
        throw new BadRequestException(
          '갤러리 날짜는 갤러리 게시글에만 입력할 수 있습니다.',
        );
      }
      return;
    }

    const startDate =
      dto.startDate !== undefined
        ? (dto.startDate?.slice(0, 10) ?? null)
        : post.startDate;
    const endDate =
      dto.endDate !== undefined
        ? dto.endDate
          ? dto.endDate.slice(0, 10)
          : null
        : post.endDate;
    if (!startDate && dto.startDate !== undefined) {
      throw new BadRequestException('갤러리 시작일을 입력해 주세요.');
    }
    if (startDate) this.assertDateRange(startDate, endDate);
    if (dto.startDate !== undefined) post.startDate = startDate;
    if (dto.endDate !== undefined) post.endDate = endDate;
  }

  private assertDateRange(startDate: string, endDate: string | null): void {
    if (endDate && endDate < startDate) {
      throw new BadRequestException('종료일은 시작일보다 앞설 수 없습니다.');
    }
  }

  async remove(
    id: string,
    actor: ActorInfo,
    request: Request,
  ): Promise<{ success: true }> {
    const post = await this.repository.findOne({ where: { id } });
    if (!post) throw new NotFoundException('게시글을 찾을 수 없습니다.');

    const fileUrls = await this.dataSource.transaction(async (manager) => {
      const urls = await this.uploads.removeByOwner(
        AttachmentOwnerType.POST,
        post.id,
        manager,
      );
      await manager.getRepository(Post).remove(post);
      return urls;
    });
    await this.uploads.deleteFiles(fileUrls);

    await this.auditLogs.record({
      action: AuditAction.POST_DELETE,
      adminId: actor.id,
      adminLoginId: actor.loginId,
      targetType: 'post',
      targetId: id,
      detail: `[${post.boardType}] ${post.title}`,
      request,
    });
    return { success: true };
  }
}
