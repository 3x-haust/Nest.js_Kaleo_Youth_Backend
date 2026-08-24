import { readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import sharp from 'sharp';
import { stripImageMetadata } from '../../common/utils/image-metadata.util';

const WEBP_OPTIONS = {
  quality: 82,
  alphaQuality: 90,
  effort: 4,
  smartSubsample: true,
} as const;

let previousEncoding = Promise.resolve();

export type StoredUpload = {
  readonly path: string;
  readonly filename: string;
  readonly originalName: string;
  readonly mimetype: string;
  readonly size: number;
};

async function runEncodingExclusively<T>(work: () => Promise<T>): Promise<T> {
  const waitForPrevious = previousEncoding;
  let release: () => void = () => {};
  previousEncoding = new Promise<void>((resolve) => {
    release = resolve;
  });
  await waitForPrevious;
  try {
    return await work();
  } finally {
    release();
  }
}

export async function encodeImageAsWebp(
  inputPath: string,
  outputPath: string,
): Promise<number> {
  return runEncodingExclusively(async () => {
    const temporaryPath = `${outputPath}.${randomUUID()}.tmp`;
    try {
      const result = await sharp(inputPath, { animated: true })
        .rotate()
        .webp(WEBP_OPTIONS)
        .toFile(temporaryPath);
      await rename(temporaryPath, outputPath);
      return result.size;
    } catch (error) {
      await unlink(temporaryPath).catch((cleanupError: unknown) => {
        if (
          cleanupError instanceof Error &&
          'code' in cleanupError &&
          cleanupError.code === 'ENOENT'
        ) {
          return;
        }
        throw cleanupError;
      });
      throw error;
    }
  });
}

async function isReusableWebp(file: Express.Multer.File): Promise<boolean> {
  if (file.mimetype !== 'image/webp') return false;
  const metadata = await sharp(file.path, { animated: true }).metadata();
  return (
    metadata.format === 'webp' &&
    !metadata.exif &&
    !metadata.iptc &&
    !metadata.xmp
  );
}

export async function normalizeStoredUpload(
  file: Express.Multer.File,
): Promise<StoredUpload> {
  if (!file.mimetype.startsWith('image/')) {
    const original = await readFile(file.path);
    const validated = stripImageMetadata(original, file.mimetype);
    if (!validated.equals(original)) await writeFile(file.path, validated);
    return {
      path: file.path,
      filename: file.filename,
      originalName: file.originalname,
      mimetype: file.mimetype,
      size: validated.length,
    };
  }

  if (await isReusableWebp(file)) {
    return {
      path: file.path,
      filename: file.filename,
      originalName: file.originalname,
      mimetype: 'image/webp',
      size: file.size,
    };
  }

  const extension = extname(file.filename);
  const filename = `${file.filename.slice(0, -extension.length)}.webp`;
  const outputPath = `${file.path.slice(0, -extension.length)}.webp`;
  const size = await encodeImageAsWebp(file.path, outputPath);
  if (outputPath !== file.path) await unlink(file.path);
  return {
    path: outputPath,
    filename,
    originalName: file.originalname,
    mimetype: 'image/webp',
    size,
  };
}
