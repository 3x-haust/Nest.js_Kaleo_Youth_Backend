import { BadRequestException } from '@nestjs/common';
import type { Request } from 'express';
import type { DataSource, Repository } from 'typeorm';
import { Attachment, Sermon } from '../../entities';
import type { AuditLogsService } from '../audit-logs/audit-logs.service';
import type { UploadsService } from '../uploads/uploads.service';
import { SermonsService } from './sermons.service';

jest.mock('../../common/utils/sanitize.util', () => ({
  sanitizePlainText: (value: string | undefined) => value?.trim() || null,
  sanitizeRichText: (value: string | undefined) => value?.trim() || null,
}));

describe('SermonsService YouTube URL boundary', () => {
  it('rejects a non-empty value without a YouTube video ID', async () => {
    const sermonRepository = {
      create: jest.fn((value: Partial<Sermon>) => value),
      save: jest.fn((value: Sermon) => Promise.resolve(value)),
    };
    const manager = {
      getRepository: jest.fn(() => sermonRepository),
    };
    const dataSource = {
      transaction: jest.fn(
        (
          callback: (value: typeof manager) => Promise<unknown>,
        ): Promise<unknown> => callback(manager),
      ),
    };
    const service = new SermonsService(
      {} as Repository<Sermon>,
      {} as Repository<Attachment>,
      dataSource as unknown as DataSource,
      { attach: jest.fn() } as unknown as UploadsService,
      { record: jest.fn() } as unknown as AuditLogsService,
    );

    await expect(
      service.create(
        {
          title: '주일 말씀',
          preacherName: '박정인 목사',
          publishedAt: '2026-08-23T00:00:00.000Z',
          youtubeUrl: 'not-a-youtube-video',
          attachmentIds: [],
        },
        { id: 'admin-id', loginId: 'admin' },
        {} as Request,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(sermonRepository.save).not.toHaveBeenCalled();
  });
});
