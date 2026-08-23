import { BadRequestException, Injectable } from '@nestjs/common';
import { sanitizePlainText } from '../../common/utils/sanitize.util';
import { YoutubeApiClient } from './youtube-api.client';
import {
  type ChannelsResponse,
  type ResolvedYoutubeChannel,
  type SearchResponse,
  type YoutubeChannelUpload,
  YOUTUBE_MAX_ITEMS,
} from './youtube-api.types';

export type {
  ResolvedYoutubeChannel,
  YoutubeChannelUpload,
} from './youtube-api.types';

@Injectable()
export class YoutubeChannelService {
  constructor(private readonly api: YoutubeApiClient) {}

  isEnabled(): boolean {
    return this.api.isEnabled();
  }

  /** 채널 ID/URL 또는 @handle/URL을 채널과 업로드 플레이리스트 ID로 해석합니다. */
  async resolveChannel(
    channelOrHandle: string,
  ): Promise<ResolvedYoutubeChannel> {
    const reference = this.parseChannelReference(channelOrHandle);
    const response = await this.api.request<ChannelsResponse>('channels', {
      part: 'contentDetails',
      maxResults: '1',
      ...(reference.type === 'id'
        ? { id: reference.value }
        : { forHandle: reference.value }),
    });
    const channel = response.items?.[0];
    const channelId = channel?.id;
    const uploadsPlaylistId =
      channel?.contentDetails?.relatedPlaylists?.uploads;
    if (!channelId || !uploadsPlaylistId) {
      throw new BadRequestException(
        '유튜브 채널을 찾을 수 없습니다. 채널이 공개 상태인지 확인해 주세요.',
      );
    }
    return { channelId, uploadsPlaylistId };
  }

  async getLatestChannelUploads(
    channelOrHandle: string,
    limit = YOUTUBE_MAX_ITEMS,
  ): Promise<YoutubeChannelUpload[]> {
    const { channelId } = await this.resolveChannel(channelOrHandle);
    const maxResults = Math.max(
      1,
      Math.min(YOUTUBE_MAX_ITEMS, Math.trunc(limit)),
    );
    const response = await this.api.request<SearchResponse>('search', {
      part: 'id',
      channelId,
      maxResults: String(maxResults),
      order: 'date',
      type: 'video',
    });
    const videoIds = [
      ...new Set(
        (response.items ?? [])
          .map((item) => item.id?.videoId)
          .filter((videoId): videoId is string => Boolean(videoId)),
      ),
    ];
    const metadata = await this.api.requestVideoMetadata(videoIds, true);
    const uploads: YoutubeChannelUpload[] = [];

    for (const videoId of videoIds) {
      const video = metadata.get(videoId);
      if (
        video?.privacyStatus !== 'public' ||
        !video.publishedAt ||
        video.isLiveBroadcast
      ) {
        continue;
      }
      const safeTitle = sanitizePlainText(
        video.localizedTitle ?? video.title ?? '',
      );
      if (!safeTitle) continue;
      uploads.push({
        youtubeVideoId: videoId,
        title: safeTitle.slice(0, 500),
        publishedAt: video.publishedAt,
        thumbnailUrl: this.api.pickThumbnail(video.thumbnails),
      });
    }
    return uploads;
  }

  private parseChannelReference(channelOrHandle: string): {
    type: 'id' | 'handle';
    value: string;
  } {
    let value = channelOrHandle.trim();
    if (/^(?:www\.)?youtube\.com\//i.test(value)) {
      value = `https://${value}`;
    }
    if (/^https?:\/\//i.test(value)) {
      value = this.channelPathFromUrl(value);
    }
    if (/^UC[A-Za-z0-9_-]{22}$/.test(value)) {
      return { type: 'id', value };
    }
    if (/^@[^\s/?#]+$/.test(value) && value.length > 1) {
      return { type: 'handle', value };
    }
    throw new BadRequestException(
      '유튜브 채널 ID 또는 @handle 형식을 확인해 주세요.',
    );
  }

  private channelPathFromUrl(value: string): string {
    try {
      const url = new URL(value);
      const hostname = url.hostname.toLowerCase();
      if (
        !['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(hostname)
      ) {
        return '';
      }
      const segments = url.pathname
        .split('/')
        .filter(Boolean)
        .map((segment) => decodeURIComponent(segment));
      if (segments[0] === 'channel') return segments[1] ?? '';
      return segments[0]?.startsWith('@') ? segments[0] : '';
    } catch {
      return '';
    }
  }
}
