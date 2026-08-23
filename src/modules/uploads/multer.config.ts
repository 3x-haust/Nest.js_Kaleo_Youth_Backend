import { BadRequestException } from '@nestjs/common';
import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { diskStorage } from 'multer';
import { randomUUID } from 'node:crypto';
import { extname, join } from 'node:path';
import { mkdirSync } from 'node:fs';

/**
 * 허용 확장자와 MIME 타입을 둘 다 화이트리스트로 검사합니다.
 * 확장자만 보면 image.png 로 위장한 스크립트가, MIME만 보면 조작된 헤더가 통과합니다.
 */
const ALLOWED: Record<string, string[]> = {
  '.jpg': ['image/jpeg'],
  '.jpeg': ['image/jpeg'],
  '.png': ['image/png'],
  '.webp': ['image/webp'],
  '.pdf': ['application/pdf'],
};

export const ALLOWED_EXTENSIONS = Object.keys(ALLOWED);

export function buildMulterOptions(uploadDir: string): MulterOptions {
  const absoluteDir = join(process.cwd(), uploadDir);
  mkdirSync(absoluteDir, { recursive: true });

  return {
    storage: diskStorage({
      destination: absoluteDir,
      filename: (_req, file, callback) => {
        // 원본 파일명은 절대 경로로 쓰지 않습니다 (경로 조작 · 덮어쓰기 방지).
        const extension = extname(file.originalname).toLowerCase();
        callback(null, `${Date.now()}-${randomUUID()}${extension}`);
      },
    }),
    fileFilter: (_req, file, callback) => {
      const extension = extname(file.originalname).toLowerCase();
      const allowedMimes = ALLOWED[extension];
      if (!allowedMimes || !allowedMimes.includes(file.mimetype)) {
        callback(
          new BadRequestException(
            `허용되지 않는 파일 형식입니다. (${ALLOWED_EXTENSIONS.join(', ')} 만 업로드할 수 있습니다)`,
          ),
          false,
        );
        return;
      }
      callback(null, true);
    },
  };
}
