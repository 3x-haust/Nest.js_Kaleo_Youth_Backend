import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, IsNull, Repository } from 'typeorm';
import type { Request } from 'express';
import { join } from 'node:path';
import { Attachment, AttachmentOwnerType, AuditAction } from '../../entities';
import { sanitizePlainText } from '../../common/utils/sanitize.util';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import type { ActorInfo } from '../sermons/sermons.service';
import { cleanupUntrackedFiles, deleteIncomingFile } from './upload-files.util';
import { normalizeStoredUpload, type StoredUpload } from './stored-upload';

@Injectable()
export class UploadsService {
  constructor(
    @InjectRepository(Attachment)
    private readonly repository: Repository<Attachment>,
    private readonly configService: ConfigService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  async registerBatch(
    files: readonly Express.Multer.File[],
    ownerType: AttachmentOwnerType,
    actor: ActorInfo,
    request: Request,
  ): Promise<Attachment[]> {
    const saved: Attachment[] = [];
    const storedPaths: string[] = [];
    try {
      const normalized = await this.normalizeBatch(files, (path) => {
        storedPaths.push(path);
      });
      const registered = await this.repository.manager.transaction(
        async (manager) => {
          for (const stored of normalized) {
            saved.push(
              await this.register(stored, ownerType, actor.id, manager),
            );
          }
          return saved;
        },
      );
      for (const attachment of registered) {
        await this.auditLogs.record({
          action: AuditAction.FILE_UPLOAD,
          adminId: actor.id,
          adminLoginId: actor.loginId,
          targetType: 'attachment',
          targetId: attachment.id,
          detail: `${ownerType} / ${attachment.originalName ?? attachment.fileUrl.split('/').pop() ?? ''}`,
          request,
        });
      }
      return registered;
    } catch (error) {
      await Promise.all(
        [...new Set([...files.map((file) => file.path), ...storedPaths])].map(
          deleteIncomingFile,
        ),
      );
      throw error;
    }
  }

  private async normalizeBatch(
    files: readonly Express.Multer.File[],
    onNormalized: (path: string) => void,
  ): Promise<StoredUpload[]> {
    const normalized: StoredUpload[] = Array.from({ length: files.length });
    let cursor = 0;
    let failure: unknown;

    const worker = async () => {
      while (!failure && cursor < files.length) {
        const index = cursor;
        cursor += 1;
        try {
          const stored = await normalizeStoredUpload(files[index]);
          normalized[index] = stored;
          onNormalized(stored.path);
        } catch (error) {
          failure = error;
        }
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(2, files.length) }, () => worker()),
    );
    if (failure) {
      throw new BadRequestException(
        '파일 내용이 선택한 파일 형식과 일치하지 않습니다.',
      );
    }
    return normalized;
  }

  private async register(
    file: StoredUpload,
    ownerType: AttachmentOwnerType,
    actorId: string,
    manager: EntityManager,
  ): Promise<Attachment> {
    const repository = manager.getRepository(Attachment);
    const attachment = repository.create({
      ownerType,
      ownerId: null,
      fileUrl: `/uploads/${file.filename}`,
      // 원본 파일명은 사용자 입력이므로 태그를 제거해 보관합니다.
      originalName: sanitizePlainText(file.originalName)?.slice(0, 255) ?? null,
      fileType: file.mimetype,
      fileSize: String(file.size),
      uploadedByAdminId: actorId,
    });
    return repository.save(attachment);
  }

  /** 게시글 등이 저장된 뒤 첨부를 그 리소스에 귀속시킵니다. */
  async attach(
    attachmentIds: string[] | undefined,
    ownerType: AttachmentOwnerType,
    ownerId: string,
    actorId: string,
    manager?: EntityManager,
  ): Promise<void> {
    if (!attachmentIds || attachmentIds.length === 0) return;
    const ids = [...new Set(attachmentIds)];
    const repository = manager?.getRepository(Attachment) ?? this.repository;
    const rows = await repository.find({
      where: {
        id: In(ids),
        ownerType,
        uploadedByAdminId: actorId,
        ownerId: IsNull(),
      },
    });
    if (rows.length !== ids.length) {
      throw new ForbiddenException(
        '본인이 업로드한 미사용 파일만 첨부할 수 있습니다.',
      );
    }
    const existing = await repository
      .createQueryBuilder('attachment')
      .select('COALESCE(MAX(attachment.displayOrder), -1)', 'maximum')
      .where('attachment.ownerType = :ownerType', { ownerType })
      .andWhere('attachment.ownerId = :ownerId', { ownerId })
      .getRawOne<{ maximum: string }>();
    const firstOrder = Number(existing?.maximum ?? -1) + 1;
    const byId = new Map(rows.map((row) => [row.id, row]));
    const ordered = ids.map((id, index) => {
      const attachment = byId.get(id)!;
      attachment.ownerId = ownerId;
      attachment.displayOrder = firstOrder + index;
      return attachment;
    });
    await repository.save(ordered);
  }

  async findByOwner(
    ownerType: AttachmentOwnerType,
    ownerId: string,
  ): Promise<Attachment[]> {
    return this.repository.find({
      where: { ownerType, ownerId },
      order: { displayOrder: 'ASC', createdAt: 'ASC' },
    });
  }

  async findManyByOwners(
    ownerType: AttachmentOwnerType,
    ownerIds: string[],
  ): Promise<Map<string, Attachment[]>> {
    const grouped = new Map<string, Attachment[]>();
    if (ownerIds.length === 0) return grouped;

    const rows = await this.repository.find({
      where: { ownerType, ownerId: In(ownerIds) },
      order: { displayOrder: 'ASC', createdAt: 'ASC' },
    });
    for (const row of rows) {
      if (!row.ownerId) continue;
      const list = grouped.get(row.ownerId) ?? [];
      list.push(row);
      grouped.set(row.ownerId, list);
    }
    return grouped;
  }

  /** 소유 리소스가 삭제될 때 첨부 레코드와 실제 파일을 함께 정리합니다. */
  async removeByOwner(
    ownerType: AttachmentOwnerType,
    ownerId: string,
    manager?: EntityManager,
  ): Promise<string[]> {
    const repository = manager?.getRepository(Attachment) ?? this.repository;
    const rows = await repository.find({ where: { ownerType, ownerId } });
    await repository.remove(rows);
    const fileUrls = rows.map((row) => row.fileUrl);
    if (!manager) await this.deleteFiles(fileUrls);
    return fileUrls;
  }

  async deleteFiles(fileUrls: readonly string[]): Promise<void> {
    await Promise.all(
      fileUrls.map((fileUrl) => this.deletePhysicalFile(fileUrl)),
    );
  }

  async remove(id: string, actorId: string): Promise<{ success: true }> {
    const attachment = await this.repository.findOne({
      where: { id, uploadedByAdminId: actorId },
    });
    if (!attachment)
      throw new NotFoundException('첨부파일을 찾을 수 없습니다.');
    await this.repository.remove(attachment);
    await this.deletePhysicalFile(attachment.fileUrl);
    return { success: true };
  }

  /**
   * 글 작성 도중 이탈해 어디에도 붙지 않은 고아 첨부를 정리합니다.
   * (관리자 대시보드에서 수동 실행)
   */
  async cleanupOrphans(
    olderThanHours = 24,
  ): Promise<{ removed: number; physicalRemoved: number }> {
    const threshold = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);
    const rows = await this.repository.manager.transaction(async (manager) => {
      const repository = manager.getRepository(Attachment);
      const locked = await repository
        .createQueryBuilder('attachment')
        .setLock('pessimistic_write')
        .where('attachment.ownerId IS NULL')
        .andWhere('attachment.createdAt < :threshold', { threshold })
        .getMany();
      await repository.remove(locked);
      return locked;
    });
    await Promise.all(rows.map((row) => this.deletePhysicalFile(row.fileUrl)));
    const uploadDir = join(
      process.cwd(),
      this.configService.get<string>('upload.dir') ?? './uploads',
    );
    const tracked = new Set(
      (await this.repository.find({ select: { fileUrl: true } }))
        .map((attachment) => attachment.fileUrl.split('/').pop())
        .filter((filename): filename is string => Boolean(filename)),
    );
    const physicalRemoved = await cleanupUntrackedFiles(
      uploadDir,
      tracked,
      threshold,
    );
    return { removed: rows.length, physicalRemoved };
  }

  async countOrphans(): Promise<number> {
    return this.repository.count({ where: { ownerId: IsNull() } });
  }

  private async deletePhysicalFile(fileUrl: string): Promise<void> {
    const filename = fileUrl.split('/').pop();
    // 경로 조작 방지: 파일명에 구분자나 상위 경로가 섞이면 건드리지 않습니다.
    if (!filename || filename.includes('..') || filename.includes('/')) return;
    const uploadDir =
      this.configService.get<string>('upload.dir') ?? './uploads';
    await deleteIncomingFile(join(process.cwd(), uploadDir, filename));
  }
}
