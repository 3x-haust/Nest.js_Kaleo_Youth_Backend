import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { basename, extname, join, resolve } from 'node:path';
import { stat } from 'node:fs/promises';
import { EntityManager, Like, Repository } from 'typeorm';
import { Attachment } from '../../entities';
import { deleteIncomingFile } from './upload-files.util';
import { encodeImageAsWebp } from './stored-upload';

export type StoredImageMigrationResult = {
  readonly converted: number;
  readonly bytesBefore: number;
  readonly bytesAfter: number;
};

const STORED_URL_REFERENCES = [
  ['posts', 'thumbnail_url'],
  ['worship_team_members', 'photo_url'],
  ['worship_team', 'cover_image_url'],
  ['events', 'cover_image_url'],
  ['setlists', 'file_url'],
  ['setlist_songs', 'thumbnail_url'],
  ['setlist_songs', 'sheet_file_url'],
  ['about_page', 'leader_photo_url'],
  ['about_page', 'closing_photo_url'],
] as const;

@Injectable()
export class StoredImageMigrationService {
  constructor(
    @InjectRepository(Attachment)
    private readonly repository: Repository<Attachment>,
    private readonly configService: ConfigService,
  ) {}

  async migrate(): Promise<StoredImageMigrationResult> {
    const rows = await this.repository.find({
      where: {
        fileUrl: Like('/uploads/%'),
        fileType: Like('image/%'),
      },
      order: { createdAt: 'ASC' },
    });
    const uploadDir = resolve(
      process.cwd(),
      this.configService.get<string>('upload.dir') ?? './uploads',
    );
    let converted = 0;
    let bytesBefore = 0;
    let bytesAfter = 0;

    for (const attachment of rows) {
      const sourceFilename = attachment.fileUrl.slice('/uploads/'.length);
      if (
        !sourceFilename ||
        basename(sourceFilename) !== sourceFilename ||
        sourceFilename.includes('..')
      ) {
        throw new Error(`Invalid stored upload path: ${attachment.fileUrl}`);
      }
      if (attachment.fileType === 'image/webp') {
        const stem = attachment.fileUrl.slice(0, -'.webp'.length);
        const previousUrls = ['.png', '.jpg', '.jpeg'].map(
          (extension) => `${stem}${extension}`,
        );
        await this.repository.manager.transaction((manager) =>
          this.updateReferences(manager, previousUrls, attachment.fileUrl),
        );
        await Promise.all(
          previousUrls.map((fileUrl) =>
            deleteIncomingFile(
              join(uploadDir, fileUrl.slice('/uploads/'.length)),
            ),
          ),
        );
        continue;
      }
      const extension = extname(sourceFilename);
      const outputFilename = `${sourceFilename.slice(0, -extension.length)}.webp`;
      const sourcePath = join(uploadDir, sourceFilename);
      const outputPath = join(uploadDir, outputFilename);
      const outputUrl = `/uploads/${outputFilename}`;
      const sourceSize = (await stat(sourcePath)).size;
      const outputSize = await encodeImageAsWebp(sourcePath, outputPath);

      try {
        await this.repository.manager.transaction(async (manager) => {
          await manager.getRepository(Attachment).update(attachment.id, {
            fileUrl: outputUrl,
            fileType: 'image/webp',
            fileSize: String(outputSize),
          });
          await this.updateReferences(manager, [attachment.fileUrl], outputUrl);
        });
      } catch (error) {
        await deleteIncomingFile(outputPath);
        throw error;
      }

      await deleteIncomingFile(sourcePath);
      converted += 1;
      bytesBefore += sourceSize;
      bytesAfter += outputSize;
    }

    return { converted, bytesBefore, bytesAfter };
  }

  private async updateReferences(
    manager: EntityManager,
    previousUrls: readonly string[],
    currentUrl: string,
  ): Promise<void> {
    for (const [table, column] of STORED_URL_REFERENCES) {
      await manager.query(
        `UPDATE "${table}" SET "${column}" = $1 WHERE "${column}" = ANY($2::text[])`,
        [currentUrl, previousUrls],
      );
    }
  }
}
