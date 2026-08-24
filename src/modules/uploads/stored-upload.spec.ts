import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { normalizeStoredUpload } from './stored-upload';

describe('normalizeStoredUpload', () => {
  it('keeps a browser-optimized WebP with its color profile byte-for-byte', async () => {
    const uploadDir = await mkdtemp(join(tmpdir(), 'kaleo-optimized-webp-'));
    const filePath = join(uploadDir, 'optimized.webp');
    const pixels = Buffer.alloc(320 * 240 * 3);
    for (let index = 0; index < pixels.length; index += 1) {
      pixels[index] = (index * 31 + Math.floor(index / 7)) % 256;
    }
    const optimized = await sharp(pixels, {
      raw: { width: 320, height: 240, channels: 3 },
    })
      .withIccProfile('srgb')
      .webp({ quality: 67 })
      .toBuffer();
    await writeFile(filePath, optimized);
    const file = {
      fieldname: 'files',
      originalname: 'optimized.webp',
      encoding: '7bit',
      mimetype: 'image/webp',
      size: optimized.length,
      destination: uploadDir,
      filename: 'optimized.webp',
      path: filePath,
      buffer: optimized,
      stream: null,
    } as unknown as Express.Multer.File;

    try {
      const stored = await normalizeStoredUpload(file);

      expect(stored.path).toBe(filePath);
      expect(stored.filename).toBe('optimized.webp');
      expect(stored.mimetype).toBe('image/webp');
      expect(await readFile(filePath)).toEqual(optimized);
    } finally {
      await rm(uploadDir, { recursive: true, force: true });
    }
  });
});
