import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { EntityManager, Repository } from 'typeorm';
import { Attachment, AttachmentOwnerType } from '../../entities';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { UploadsService } from './uploads.service';

jest.mock('../../common/utils/sanitize.util', () => ({
  sanitizePlainText: (value: string) => value,
}));

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

describe('UploadsService', () => {
  it('stores an uploaded PNG as compressed WebP', async () => {
    const uploadDir = await mkdtemp(join(tmpdir(), 'kaleo-webp-'));
    const originalPath = join(uploadDir, 'incoming.png');
    await writeFile(originalPath, PNG_1X1);

    const attachmentRepository = {
      create: jest.fn((value: Partial<Attachment>) => value as Attachment),
      save: jest.fn((value: Attachment) =>
        Promise.resolve({ ...value, id: 'attachment-id' }),
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
    const auditLogs = { record: jest.fn().mockResolvedValue(undefined) };
    const service = new UploadsService(
      repository as unknown as Repository<Attachment>,
      { get: jest.fn(() => uploadDir) } as unknown as ConfigService,
      auditLogs as unknown as AuditLogsService,
    );
    const file = {
      fieldname: 'files',
      originalname: 'incoming.png',
      encoding: '7bit',
      mimetype: 'image/png',
      size: PNG_1X1.length,
      destination: uploadDir,
      filename: 'incoming.png',
      path: originalPath,
      buffer: PNG_1X1,
      stream: null,
    } as unknown as Express.Multer.File;

    try {
      const [saved] = await service.registerBatch(
        [file],
        AttachmentOwnerType.POST,
        { id: 'admin-id', loginId: 'admin' },
        {} as Request,
      );

      expect(saved).toEqual(
        expect.objectContaining({
          fileType: 'image/webp',
          fileUrl: '/uploads/incoming.webp',
        }),
      );
      const stored = await readFile(join(uploadDir, 'incoming.webp'));
      expect(stored.toString('ascii', 0, 4)).toBe('RIFF');
      expect(stored.toString('ascii', 8, 12)).toBe('WEBP');
      await expect(access(originalPath)).rejects.toMatchObject({
        code: 'ENOENT',
      });
    } finally {
      await rm(uploadDir, { recursive: true, force: true });
    }
  });
});
