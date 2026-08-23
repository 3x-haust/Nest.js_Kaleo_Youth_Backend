import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  type VideoMetadata,
  type VideosResponse,
  type YoutubeErrorResponse,
  YOUTUBE_MAX_ITEMS,
  type YoutubeThumbnails,
} from './youtube-api.types';

const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';

@Injectable()
export class YoutubeApiClient {
  private readonly logger = new Logger(YoutubeApiClient.name);

  constructor(private readonly configService: ConfigService) {}

  isEnabled(): boolean {
    return (this.configService.get<string>('youtube.apiKey') ?? '').length > 0;
  }

  async request<T>(
    endpoint: string,
    params: Record<string, string>,
  ): Promise<T> {
    const apiKey = this.requireApiKey();
    const timeoutMs =
      this.configService.get<number>('youtube.timeoutMs') ?? 5000;
    const url = new URL(`${YOUTUBE_API_BASE}/${endpoint}`);
    for (const [key, value] of Object.entries({ ...params, key: apiKey })) {
      url.searchParams.set(key, value);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      const body = (await response.json()) as T & YoutubeErrorResponse;
      if (!response.ok) {
        this.logger.warn(
          `YouTube API 오류 (${endpoint}, status=${response.status}): ${body.error?.message ?? 'unknown'}`,
        );
        throw this.toFriendlyError(
          response.status,
          body.error?.errors?.[0]?.reason,
        );
      }
      return body;
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof BadGatewayException ||
        error instanceof ServiceUnavailableException
      ) {
        throw error;
      }
      if (error instanceof Error && error.name === 'AbortError') {
        throw new ServiceUnavailableException(
          '유튜브 응답이 지연되고 있습니다. 잠시 후 다시 시도하거나 곡을 직접 입력해 주세요.',
        );
      }
      this.logger.error(
        `YouTube API 호출 실패 (${endpoint})`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new BadGatewayException(
        '유튜브에서 정보를 가져오지 못했습니다. 곡을 직접 입력해 주세요.',
      );
    } finally {
      clearTimeout(timer);
    }
  }

  async requestVideoMetadata(
    videoIds: readonly string[],
    includeStatus = false,
  ): Promise<Map<string, VideoMetadata>> {
    const metadata = new Map<string, VideoMetadata>();
    for (
      let offset = 0;
      offset < videoIds.length;
      offset += YOUTUBE_MAX_ITEMS
    ) {
      const response = await this.request<VideosResponse>('videos', {
        part: includeStatus ? 'snippet,status,liveStreamingDetails' : 'snippet',
        id: videoIds.slice(offset, offset + YOUTUBE_MAX_ITEMS).join(','),
        hl: 'ko',
      });
      for (const item of response.items ?? []) {
        if (!item.id) continue;
        metadata.set(item.id, {
          title: item.snippet?.title,
          localizedTitle: item.snippet?.localized?.title,
          publishedAt: item.snippet?.publishedAt,
          privacyStatus: item.status?.privacyStatus,
          thumbnails: item.snippet?.thumbnails,
          isLiveBroadcast: item.liveStreamingDetails !== undefined,
        });
      }
    }
    return metadata;
  }

  pickThumbnail(thumbnails?: YoutubeThumbnails): string | null {
    if (!thumbnails) return null;
    for (const key of ['maxres', 'standard', 'high', 'medium', 'default']) {
      const url = thumbnails[key]?.url;
      if (url && /^https:\/\/i\.ytimg\.com\//.test(url)) return url;
    }
    return null;
  }

  private requireApiKey(): string {
    const apiKey = this.configService.get<string>('youtube.apiKey') ?? '';
    if (!apiKey) {
      throw new ServiceUnavailableException(
        '유튜브 연동이 아직 설정되지 않았습니다. 곡을 직접 입력해 주세요.',
      );
    }
    return apiKey;
  }

  private toFriendlyError(status: number, reason?: string) {
    if (reason === 'quotaExceeded' || reason === 'rateLimitExceeded') {
      return new ServiceUnavailableException(
        '오늘 유튜브 연동 사용량을 모두 소진했습니다. 곡을 직접 입력해 주세요.',
      );
    }
    if (reason === 'playlistNotFound' || status === 404) {
      return new BadRequestException(
        '플레이리스트를 찾을 수 없습니다. 공개(또는 일부공개) 상태인지 확인해 주세요.',
      );
    }
    if (status === 403) {
      return new ServiceUnavailableException(
        '유튜브 연동 설정에 문제가 있습니다. 관리자에게 문의해 주세요.',
      );
    }
    return new BadGatewayException(
      '유튜브에서 정보를 가져오지 못했습니다. 곡을 직접 입력해 주세요.',
    );
  }
}
