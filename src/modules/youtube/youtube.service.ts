import { BadRequestException, Injectable } from '@nestjs/common';
import { sanitizePlainText } from '../../common/utils/sanitize.util';
import {
  extractYoutubePlaylistId,
  guessSongFromVideoTitle,
} from '../../common/utils/youtube.util';
import { YoutubeApiClient } from './youtube-api.client';
import {
  type ImportedSong,
  type PlaylistImportResult,
  type PlaylistItemsResponse,
  type PlaylistsResponse,
  YOUTUBE_MAX_ITEMS,
} from './youtube-api.types';

export type { ImportedSong, PlaylistImportResult } from './youtube-api.types';

const UNAVAILABLE_TITLES = new Set([
  'Deleted video',
  'Private video',
  '삭제된 동영상',
  '비공개 동영상',
]);

@Injectable()
export class YoutubeService {
  constructor(private readonly api: YoutubeApiClient) {}

  /** 키가 없으면 프론트는 수동 입력 모드로 동작해야 합니다. */
  isEnabled(): boolean {
    return this.api.isEnabled();
  }

  /**
   * 플레이리스트 URL(또는 ID)에서 곡 목록을 가져옵니다.
   *
   * SSRF 방지: 입력받은 URL로 요청하지 않습니다. list= 값만 정규식으로 뽑아내고
   * 요청 URL은 googleapis.com 으로 서버가 직접 조립합니다. si= 등 추적 파라미터는 버려집니다.
   */
  async importPlaylist(urlOrId: string): Promise<PlaylistImportResult> {
    const playlistId = extractYoutubePlaylistId(urlOrId);
    if (!playlistId) {
      throw new BadRequestException(
        '유튜브 플레이리스트 주소를 인식하지 못했습니다. list= 가 포함된 주소인지 확인해 주세요.',
      );
    }

    const [itemsResponse, playlistResponse] = await Promise.all([
      this.requestAllPlaylistItems(playlistId),
      this.api
        .request<PlaylistsResponse>('playlists', {
          part: 'snippet',
          id: playlistId,
        })
        .catch(() => null),
    ]);
    const playlistItems = itemsResponse.items ?? [];
    const videoMetadata = await this.api.requestVideoMetadata(
      playlistItems
        .map((item) => item.snippet?.resourceId?.videoId)
        .filter((videoId): videoId is string => videoId !== undefined),
    );
    const songs: ImportedSong[] = [];
    let unavailableCount = 0;

    for (const [index, item] of playlistItems.entries()) {
      const videoId = item.snippet?.resourceId?.videoId;
      const metadata = videoId ? videoMetadata.get(videoId) : undefined;
      const rawTitle = metadata?.localizedTitle ?? item.snippet?.title ?? '';
      const safeTitle = sanitizePlainText(rawTitle) ?? '';
      const isUnavailable =
        UNAVAILABLE_TITLES.has(safeTitle) || safeTitle.length === 0;
      if (isUnavailable) unavailableCount += 1;

      const parsed = isUnavailable
        ? { songTitle: '(삭제되었거나 비공개된 영상)', artist: null }
        : guessSongFromVideoTitle(safeTitle);
      songs.push({
        displayOrder: item.snippet?.position ?? index,
        songTitle: parsed.songTitle.slice(0, 300),
        artist: parsed.artist ? parsed.artist.slice(0, 200) : null,
        youtubeVideoId: videoId ?? null,
        youtubeVideoTitle: safeTitle.slice(0, 500),
        thumbnailUrl: this.api.pickThumbnail(
          metadata?.thumbnails ?? item.snippet?.thumbnails,
        ),
        isUnavailable,
      });
    }

    songs.sort((left, right) => left.displayOrder - right.displayOrder);
    songs.forEach((song, index) => {
      song.displayOrder = index;
    });
    return {
      playlistId,
      playlistTitle:
        sanitizePlainText(playlistResponse?.items?.[0]?.snippet?.title)?.slice(
          0,
          300,
        ) ?? null,
      songs,
      unavailableCount,
    };
  }

  private async requestAllPlaylistItems(
    playlistId: string,
  ): Promise<PlaylistItemsResponse> {
    const items: NonNullable<PlaylistItemsResponse['items']> = [];
    const seenTokens = new Set<string>();
    let pageToken: string | undefined;

    while (true) {
      const response = await this.api.request<PlaylistItemsResponse>(
        'playlistItems',
        {
          part: 'snippet',
          maxResults: String(YOUTUBE_MAX_ITEMS),
          playlistId,
          ...(pageToken ? { pageToken } : {}),
        },
      );
      items.push(...(response.items ?? []));
      const nextPageToken = response.nextPageToken;
      if (!nextPageToken || seenTokens.has(nextPageToken)) break;
      seenTokens.add(nextPageToken);
      pageToken = nextPageToken;
    }
    return { items };
  }
}
