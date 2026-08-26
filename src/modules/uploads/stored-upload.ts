import { readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { Logger } from '@nestjs/common';
import { extname } from 'node:path';
import { promisify } from 'node:util';
import sharp from 'sharp';
import decodeHeic from 'heic-decode';
import { stripImageMetadata } from '../../common/utils/image-metadata.util';

const WEBP_OPTIONS = {
  quality: 82,
  alphaQuality: 90,
  effort: 0,
  smartSubsample: true,
} as const;

const MAX_IMAGE_EDGE = 2560;
const MAX_HEIF_IMAGE_EDGE = 1024;
const MAX_PARALLEL_ENCODINGS = 1;
const HEIF_CONVERT_TIMEOUT_MS = 90_000;
const execFileAsync = promisify(execFile);
const logger = new Logger('StoredUpload');
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

function errorCode(error: unknown): string | null {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return null;
  }
  return typeof error.code === 'string' ? error.code : null;
}

async function removeIfExists(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return;
    throw error;
  }
}

async function convertHeifNative(
  inputPath: string,
  decodedPath: string,
): Promise<boolean> {
  const converter = process.env.HEIF_CONVERT_BIN ?? 'heif-convert';
  const started = performance.now();
  try {
    await execFileAsync(
      converter,
      [
        '--quiet',
        '--codec-threads',
        '1',
        '--tile-threads',
        '1',
        '-q',
        '95',
        inputPath,
        decodedPath,
      ],
      {
        timeout: HEIF_CONVERT_TIMEOUT_MS,
        maxBuffer: 1024 * 1024,
      },
    );
    logger.log({
      event: 'heif.native-convert',
      elapsedMs: Math.round(performance.now() - started),
      rssBytes: process.memoryUsage().rss,
    });
    return true;
  } catch (error) {
    if (
      errorCode(error) === 'ENOENT' &&
      process.env.NODE_ENV !== 'production'
    ) {
      return false;
    }
    throw error;
  }
}

async function imagePipeline(
  inputPath: string,
  mimeType: string | undefined,
  decodedPath: string,
) {
  if (!mimeType || !HEIF_MIME_TYPES.has(mimeType)) {
    return sharp(inputPath, { animated: true });
  }

  if (await convertHeifNative(inputPath, decodedPath)) {
    return sharp(decodedPath, { animated: true });
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
    const decodedPath = `${temporaryPath}.jpg`;
    const maximumEdge =
      mimeType && HEIF_MIME_TYPES.has(mimeType)
        ? MAX_HEIF_IMAGE_EDGE
        : MAX_IMAGE_EDGE;
    try {
      const result = await (
        await imagePipeline(inputPath, mimeType, decodedPath)
      )
        .rotate()
        .resize({
          width: maximumEdge,
          height: maximumEdge,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp(WEBP_OPTIONS)
        .toFile(temporaryPath);
      await rename(temporaryPath, outputPath);
      return result.size;
    } catch (error) {
      await removeIfExists(temporaryPath);
      throw error;
    } finally {
      await removeIfExists(decodedPath);
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
