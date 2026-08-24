import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { DataSource, In } from 'typeorm';
import { Sermon } from '../../entities';
import {
  YoutubeChannelService,
  type YoutubeChannelUpload,
} from '../youtube/youtube-channel.service';

const SERMON_SYNC_LOCK_KEY = 'sermon-youtube-sync';
const RECENT_UPLOAD_LIMIT = 50;
const TITLE_MAX_LENGTH = 200;
const PREACHER_NAME_MAX_LENGTH = 50;
const BIBLE_REFERENCE_MAX_LENGTH = 120;
const STRUCTURED_TITLE_PATTERN =
  /^\s*(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.\s*([^.]+?)\s*\.\s*([^.]+?)\s*\.\s*(.+?)\s*$/u;

type StructuredSermonMetadata = {
  readonly title: string;
  readonly publishedAt: string;
  readonly preacherName: string;
  readonly bibleReference: string;
};

export type SermonYoutubeSyncResult =
  | { readonly status: 'disabled' }
  | { readonly status: 'unchanged' }
  | {
      readonly status: 'created';
      readonly count: number;
      readonly youtubeVideoIds: string[];
    }
  | { readonly status: 'failed'; readonly reason: 'youtube_error' };

@Injectable()
export class SermonYoutubeSyncService {
  private readonly logger = new Logger(SermonYoutubeSyncService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly youtubeChannel: YoutubeChannelService,
    private readonly configService: ConfigService,
  ) {}

  /** 매일 한국 시간 오전 4시. 콘티 동기화(오전 3시)와 겹치지 않습니다. */
  @Cron('0 4 * * *', { timeZone: 'Asia/Seoul' })
  async sync(): Promise<SermonYoutubeSyncResult> {
    const channel = (
      this.configService.get<string>('youtube.sermonChannel') ?? ''
    ).trim();
    if (!channel || !this.youtubeChannel.isEnabled()) {
      return { status: 'disabled' };
    }

    let uploads: YoutubeChannelUpload[];
    try {
      uploads = await this.youtubeChannel.getLatestChannelUploads(
        channel,
        RECENT_UPLOAD_LIMIT,
      );
    } catch (error) {
      this.logger.warn(
        `YouTube 설교 동기화 조회 실패: ${error instanceof Error ? error.message : String(error)}`,
      );
      return { status: 'failed', reason: 'youtube_error' };
    }

    const orderedUploads = this.uniqueOldestFirst(uploads);
    const structuredUploads = orderedUploads.flatMap((upload) => {
      const metadata = this.parseStructuredTitle(upload.title);
      return metadata ? [{ upload, metadata }] : [];
    });
    if (structuredUploads.length === 0) return { status: 'unchanged' };

    return this.dataSource.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        SERMON_SYNC_LOCK_KEY,
      ]);

      const repository = manager.getRepository(Sermon);
      const videoIds = structuredUploads.map(
        ({ upload }) => upload.youtubeVideoId,
      );
      const existing = await repository.find({
        where: { youtubeVideoId: In(videoIds) },
      });
      const existingIds = new Set(
        existing
          .map((sermon) => sermon.youtubeVideoId)
          .filter((videoId): videoId is string => Boolean(videoId)),
      );
      const unseen = structuredUploads.filter(
        ({ upload }) => !existingIds.has(upload.youtubeVideoId),
      );
      if (unseen.length === 0) return { status: 'unchanged' } as const;

      const sermons = unseen.map(({ upload, metadata }) => {
        return repository.create({
          title: metadata.title,
          publishedAt: metadata.publishedAt,
          youtubeVideoId: upload.youtubeVideoId,
          preacherName: metadata.preacherName,
          summary: null,
          bibleReference: metadata.bibleReference,
          createdByAdminId: null,
        });
      });
      await repository.save(sermons);

      return {
        status: 'created',
        count: sermons.length,
        youtubeVideoIds: unseen.map(({ upload }) => upload.youtubeVideoId),
      } as const;
    });
  }

  private uniqueOldestFirst(
    uploads: readonly YoutubeChannelUpload[],
  ): YoutubeChannelUpload[] {
    const unique = new Map<string, YoutubeChannelUpload>();
    for (const upload of uploads) {
      if (!unique.has(upload.youtubeVideoId)) {
        unique.set(upload.youtubeVideoId, upload);
      }
    }
    return [...unique.values()].sort(
      (left, right) =>
        left.publishedAt.localeCompare(right.publishedAt) ||
        left.youtubeVideoId.localeCompare(right.youtubeVideoId),
    );
  }

  private parseStructuredTitle(
    youtubeTitle: string,
  ): StructuredSermonMetadata | null {
    const match = STRUCTURED_TITLE_PATTERN.exec(youtubeTitle);
    if (!match) return null;

    const [, yearText, monthText, dayText, rawPreacher, rawBible, rawTitle] =
      match;
    if (
      !yearText ||
      !monthText ||
      !dayText ||
      !rawPreacher ||
      !rawBible ||
      !rawTitle
    ) {
      return null;
    }

    const year = Number(yearText);
    const month = Number(monthText);
    const day = Number(dayText);
    const date = new Date(Date.UTC(year, month - 1, day));
    const preacherName = rawPreacher.trim();
    const bibleReference = rawBible.trim();
    const title = rawTitle.trim();
    const isCalendarDate =
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day;
    if (
      !isCalendarDate ||
      title.length > TITLE_MAX_LENGTH ||
      preacherName.length > PREACHER_NAME_MAX_LENGTH ||
      bibleReference.length > BIBLE_REFERENCE_MAX_LENGTH
    ) {
      return null;
    }

    return {
      title,
      publishedAt: `${yearText}-${monthText.padStart(2, '0')}-${dayText.padStart(2, '0')}`,
      preacherName,
      bibleReference,
    };
  }
}
