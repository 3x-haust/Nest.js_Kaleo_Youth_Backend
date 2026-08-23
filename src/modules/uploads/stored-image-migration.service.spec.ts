import { ConfigService } from '@nestjs/config';
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import type { Repository } from 'typeorm';
import { Attachment } from '../../entities';
import { StoredImageMigrationService } from './stored-image-migration.service';

describe('StoredImageMigrationService', () => {
  it('converts an existing upload and updates its attachment metadata', async () => {
    const uploadDir = await mkdtemp(join(tmpdir(), 'kaleo-migration-'));
    const sourceFilename = 'existing.png';
    const sourcePath = join(uploadDir, sourceFilename);
    const pixels = Buffer.alloc(128 * 128 * 3);
    for (let index = 0; index < pixels.length; index += 1) {
      pixels[index] = (index * 17 + Math.floor(index / 11)) % 256;
    }
    await sharp(pixels, {
      raw: { width: 128, height: 128, channels: 3 },
    })
      .png()
      .toFile(sourcePath);
    const attachment = {
      id: 'attachment-id',
      fileUrl: `/uploads/${sourceFilename}`,
      fileType: 'image/png',
      fileSize: null,
      createdAt: new Date('2026-08-23T00:00:00Z'),
    } as Attachment;
    const transactionalRepository = {
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const manager = {
      getRepository: jest.fn(() => transactionalRepository),
      query: jest.fn().mockResolvedValue([]),
    };
    const repository = {
      find: jest.fn().mockResolvedValue([attachment]),
      manager: {
        transaction: jest.fn(
          (callback: (entityManager: typeof manager) => Promise<void>) =>
            callback(manager),
        ),
      },
    };
    const service = new StoredImageMigrationService(
      repository as unknown as Repository<Attachment>,
      { get: jest.fn(() => uploadDir) } as unknown as ConfigService,
    );

    try {
      const result = await service.migrate();

      expect(result.converted).toBe(1);
      expect(result.bytesBefore).toBeGreaterThan(0);
      expect(result.bytesAfter).toBeGreaterThan(0);
      expect(transactionalRepository.update).toHaveBeenCalledWith(
        'attachment-id',
        expect.objectContaining({
          fileUrl: '/uploads/existing.webp',
          fileType: 'image/webp',
          fileSize: String(result.bytesAfter),
        }),
      );
      expect(manager.query).toHaveBeenCalledWith(
        'UPDATE "posts" SET "thumbnail_url" = $1 WHERE "thumbnail_url" = ANY($2::text[])',
        ['/uploads/existing.webp', ['/uploads/existing.png']],
      );
      const stored = await readFile(join(uploadDir, 'existing.webp'));
      expect(stored.toString('ascii', 0, 4)).toBe('RIFF');
      expect(stored.toString('ascii', 8, 12)).toBe('WEBP');
      await expect(access(sourcePath)).rejects.toMatchObject({
        code: 'ENOENT',
      });
    } finally {
      await rm(uploadDir, { recursive: true, force: true });
    }
  });
});
