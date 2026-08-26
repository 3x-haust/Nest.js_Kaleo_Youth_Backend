import { readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import sharp from 'sharp';
import decodeHeic from 'heic-decode';
import { stripImageMetadata } from '../../common/utils/image-metadata.util';

const WEBP_OPTIONS = {
  quality: 82,
  alphaQuality: 90,
  effort: 4,
  smartSubsample: true,
} as const;

const MAX_PARALLEL_ENCODINGS = 1;
let activeEncodings = 0;
const encodingWaiters: Array<() => void> = [];

export type StoredUpload = {
  readonly path: string;
  readonly filename: string;
  readonly originalName: string;
  readonly mimetype: string;
  readonly size: number;
};

async function runEncodingLimited<T>(work: () => Promise<T>): Promise<T> {
  if (activeEncodings >= MAX_PARALLEL_ENCODINGS) {
    await new Promise<void>((resolve) => {
      encodingWaiters.push(resolve);
    });
  }
  activeEncodings += 1;
  try {
    return await work();
  } finally {
    activeEncodings -= 1;
    encodingWaiters.shift()?.();
  }
}

const HEIF_MIME_TYPES = new Set([
  'image/heic',
  'image/heif',
  'image/heic-sequence',
  'image/heif-sequence',
]);

async function imagePipeline(inputPath: string, mimeType?: string) {
  if (!mimeType || !HEIF_MIME_TYPES.has(mimeType)) {
    return sharp(inputPath, { animated: true });
  }

  const decoded = await decodeHeic({ buffer: await readFile(inputPath) });
  return sharp(decoded.data, {
    raw: {
      width: decoded.width,
      height: decoded.height,
      channels: 4,
    },
  });
}

export async function encodeImageAsWebp(
  inputPath: string,
  outputPath: string,
  mimeType?: string,
): Promise<number> {
  return runEncodingLimited(async () => {
    const temporaryPath = `${outputPath}.${randomUUID()}.tmp`;
    try {
      const result = await (
        await imagePipeline(inputPath, mimeType)
      )
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
  const size = await encodeImageAsWebp(file.path, outputPath, file.mimetype);
  if (outputPath !== file.path) await unlink(file.path);
  return {
    path: outputPath,
    filename,
    originalName: file.originalname,
    mimetype: 'image/webp',
    size,
  };
}
