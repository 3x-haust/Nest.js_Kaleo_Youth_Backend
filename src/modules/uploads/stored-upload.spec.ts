import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { encodeImageAsWebp, normalizeStoredUpload } from './stored-upload';

describe('normalizeStoredUpload', () => {
  it('decodes a real HEIC fixture and stores only normalized WebP', async () => {
    const uploadDir = await mkdtemp(join(tmpdir(), 'kaleo-heic-webp-'));
    const filePath = join(uploadDir, 'incoming.heic');
    const fixture = await readFile(
      join(__dirname, 'tests', 'fixtures', 'minimal.heic'),
    );
    await writeFile(filePath, fixture);
    const file = {
      fieldname: 'files',
      originalname: 'camera.heic',
      encoding: '7bit',
      mimetype: 'image/heic',
      size: fixture.length,
      destination: uploadDir,
      filename: 'incoming.heic',
      path: filePath,
      buffer: fixture,
      stream: null,
    } as unknown as Express.Multer.File;

    try {
      const stored = await normalizeStoredUpload(file);

      expect(stored.filename).toBe('incoming.webp');
      expect(stored.mimetype).toBe('image/webp');
      await expect(readFile(filePath)).rejects.toMatchObject({
        code: 'ENOENT',
      });
      const metadata = await sharp(stored.path).metadata();
      expect(metadata).toMatchObject({ format: 'webp', width: 2, height: 2 });
    } finally {
      await rm(uploadDir, { recursive: true, force: true });
    }
  });

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

  it('downscales oversized server-normalized images before storage', async () => {
    const uploadDir = await mkdtemp(join(tmpdir(), 'kaleo-large-image-'));
    const filePath = join(uploadDir, 'incoming.jpg');
    const image = await sharp({
      create: {
        width: 4000,
        height: 3000,
        channels: 3,
        background: '#19324f',
      },
    })
      .jpeg()
      .toBuffer();
    await writeFile(filePath, image);
    const file = {
      fieldname: 'files',
      originalname: 'camera.jpg',
      encoding: '7bit',
      mimetype: 'image/jpeg',
      size: image.length,
      destination: uploadDir,
      filename: 'incoming.jpg',
      path: filePath,
      buffer: image,
      stream: null,
    } as unknown as Express.Multer.File;

    try {
      const stored = await normalizeStoredUpload(file);
      const metadata = await sharp(stored.path).metadata();

      expect(metadata).toMatchObject({
        format: 'webp',
        width: 2560,
        height: 1920,
      });
    } finally {
      await rm(uploadDir, { recursive: true, force: true });
    }
  });

  it('uses an isolated external converter for HEIC input', async () => {
    const uploadDir = await mkdtemp(join(tmpdir(), 'kaleo-native-heic-'));
    const inputPath = join(uploadDir, 'incoming.heic');
    const outputPath = join(uploadDir, 'normalized.webp');
    const converterPath = join(uploadDir, 'fake-heif-convert.cjs');
    const converterArgsPath = `${inputPath}.args`;
    const decodedJpeg = await sharp({
      create: {
        width: 32,
        height: 24,
        channels: 4,
        background: { r: 25, g: 50, b: 79, alpha: 1 },
      },
    })
      .png()
      .toBuffer();
    await writeFile(inputPath, Buffer.from('converter must read this path'));
    await writeFile(
      converterPath,
      [
        '#!/usr/bin/env node',
        "const { writeFileSync } = require('node:fs');",
        'const args = process.argv.slice(2);',
        'writeFileSync(`${args.at(-2)}.args`, JSON.stringify(args));',
        `writeFileSync(process.argv.at(-1), Buffer.from('${decodedJpeg.toString('base64')}', 'base64'));`,
      ].join('\n'),
    );
    await chmod(converterPath, 0o755);
    const previousConverter = process.env.HEIF_CONVERT_BIN;
    process.env.HEIF_CONVERT_BIN = converterPath;

    try {
      await encodeImageAsWebp(inputPath, outputPath, 'image/heic');
      const metadata = await sharp(outputPath).metadata();
      const converterArgs = JSON.parse(
        await readFile(converterArgsPath, 'utf8'),
      ) as string[];

      expect(metadata).toMatchObject({
        format: 'webp',
        width: 32,
        height: 24,
      });
      expect(converterArgs.slice(0, -2)).toEqual([
        '--quiet',
        '--codec-threads',
        '1',
        '--tile-threads',
        '1',
        '-q',
        '95',
      ]);
      expect(converterArgs.at(-2)).toBe(inputPath);
      expect(converterArgs.at(-1)).toMatch(/\.jpg$/);
    } finally {
      if (previousConverter === undefined) {
        delete process.env.HEIF_CONVERT_BIN;
      } else {
        process.env.HEIF_CONVERT_BIN = previousConverter;
      }
      await rm(uploadDir, { recursive: true, force: true });
    }
  });
});
