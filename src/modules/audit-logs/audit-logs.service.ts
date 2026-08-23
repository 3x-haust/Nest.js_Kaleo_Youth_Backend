import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import type { Request } from 'express';
import { AuditAction, AuditLog } from '../../entities';
import { getClientIp, getUserAgent } from '../../common/utils/request.util';
import {
  paginate,
  type PaginatedResult,
} from '../../common/dto/pagination.dto';

export interface RecordAuditInput {
  action: AuditAction;
  adminId?: string | null;
  adminLoginId?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  detail?: string | null;
  request?: Request;
}

@Injectable()
export class AuditLogsService {
  private readonly logger = new Logger(AuditLogsService.name);

  constructor(
    @InjectRepository(AuditLog)
    private readonly repository: Repository<AuditLog>,
  ) {}

  async record(input: RecordAuditInput): Promise<void> {
    try {
      await this.repository.save(
        this.repository.create({
          action: input.action,
          adminId: input.adminId ?? null,
          adminLoginId: input.adminLoginId ?? null,
          targetType: input.targetType ?? null,
          targetId: input.targetId ?? null,
          detail: input.detail?.slice(0, 300) ?? null,
          ipAddress: input.request ? getClientIp(input.request) : null,
          userAgent: input.request ? getUserAgent(input.request) : null,
        }),
      );
    } catch (error) {
      this.logger.error(
        `감사 로그 기록 실패 (action=${input.action})`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  async purgeExpired(
    retentionDays = Number(process.env.AUDIT_LOG_RETENTION_DAYS ?? 365),
  ): Promise<number> {
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    const result = await this.repository.delete({
      createdAt: LessThan(cutoff),
    });
    return result.affected ?? 0;
  }

  async findAll(options: {
    page: number;
    limit: number;
    action?: string;
    adminId?: string;
  }): Promise<PaginatedResult<AuditLog>> {
    const query = this.repository
      .createQueryBuilder('log')
      .orderBy('log.createdAt', 'DESC')
      .skip((options.page - 1) * options.limit)
      .take(options.limit);

    if (options.action) {
      query.andWhere('log.action = :action', { action: options.action });
    }
    if (options.adminId) {
      query.andWhere('log.adminId = :adminId', { adminId: options.adminId });
    }

    const [items, total] = await query.getManyAndCount();
    return paginate(items, total, options.page, options.limit);
  }
}
