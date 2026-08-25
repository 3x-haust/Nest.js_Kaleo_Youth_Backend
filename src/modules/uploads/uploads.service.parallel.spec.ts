import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import type { EntityManager, Repository } from 'typeorm';
import { Attachment, AttachmentOwnerType } from '../../entities';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { normalizeStoredUpload } from './stored-upload';
import { UploadsService } from './uploads.service';

jest.mock('./stored-upload', () => ({
  normalizeStoredUpload: jest.fn(),
}));
jest.mock('../../common/utils/sanitize.util', () => ({
  sanitizePlainText: (value: string) => value,
}));

const mockedNormalize = jest.mocked(normalizeStoredUpload);

describe('UploadsService batch normalization', () => {
  beforeEach(() => {
    mockedNormalize.mockReset();
  });

  it('normalizes two files concurrently without unbounded fan-out', async () => {
    let active = 0;
    let maximumActive = 0;
    mockedNormalize.mockImplementation(async (file) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise<void>((resolve) => queueMicrotask(resolve));
      active -= 1;
      return {
        path: file.path,
        filename: `${file.filename}.webp`,
        originalName: file.originalname,
        mimetype: 'image/webp',
        size: file.size,
      };
    });

    const attachmentRepository = {
      create: jest.fn((value: Partial<Attachment>) => value as Attachment),
      save: jest.fn((value: Attachment) =>
        Promise.resolve({ ...value, id: value.fileUrl }),
      ),
    };
    const manager = {
      getRepository: jest.fn(() => attachmentRepository),
    };
    const repository = {
      manager: {
        transaction: jest.fn(
          (callback: (entityManager: EntityManager) => Promise<Attachment[]>) =>
            callback(manager as unknown as EntityManager),
        ),
      },
    };
    const service = new UploadsService(
      repository as unknown as Repository<Attachment>,
      { get: jest.fn() } as unknown as ConfigService,
      {
        record: jest.fn().mockResolvedValue(undefined),
      } as unknown as AuditLogsService,
    );
    const files = Array.from({ length: 4 }, (_, index) => ({
      originalname: `photo-${index}.heic`,
      filename: `photo-${index}.heic`,
      path: `/tmp/photo-${index}.heic`,
      mimetype: 'image/heic',
      size: 1024,
    })) as Express.Multer.File[];

    await service.registerBatch(
      files,
      AttachmentOwnerType.POST,
      { id: 'admin-id', loginId: 'admin' },
      {} as Request,
    );

    expect(maximumActive).toBe(2);
  });
});
