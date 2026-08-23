export const YOUTUBE_MAX_ITEMS = 50;

export type YoutubeThumbnails = Record<string, { url?: string }>;

export interface ImportedSong {
  displayOrder: number;
  songTitle: string;
  artist: string | null;
  youtubeVideoId: string | null;
  /** 파싱 전 원본 제목 (재파싱·대조용) */
  youtubeVideoTitle: string;
  thumbnailUrl: string | null;
  isUnavailable: boolean;
}

export interface PlaylistImportResult {
  playlistId: string;
  playlistTitle: string | null;
  songs: ImportedSong[];
  /** 삭제·비공개로 제목을 확인할 수 없었던 항목 수 */
  unavailableCount: number;
}

export interface ResolvedYoutubeChannel {
  channelId: string;
  uploadsPlaylistId: string;
}

export interface YoutubeChannelUpload {
  youtubeVideoId: string;
  title: string;
  publishedAt: string;
  thumbnailUrl: string | null;
}

export interface PlaylistItemsResponse {
  nextPageToken?: string;
  items?: Array<{
    snippet?: {
      title?: string;
      position?: number;
      publishedAt?: string;
      resourceId?: { videoId?: string };
      thumbnails?: YoutubeThumbnails;
    };
    contentDetails?: { videoId?: string; videoPublishedAt?: string };
  }>;
}

export interface SearchResponse {
  items?: Array<{ id?: { videoId?: string } }>;
}

export interface ChannelsResponse {
  items?: Array<{
    id?: string;
    contentDetails?: { relatedPlaylists?: { uploads?: string } };
  }>;
}

export interface PlaylistsResponse {
  items?: Array<{ snippet?: { title?: string } }>;
}

export interface VideosResponse {
  items?: Array<{
    id?: string;
    snippet?: {
      title?: string;
      localized?: { title?: string };
      publishedAt?: string;
      thumbnails?: YoutubeThumbnails;
    };
    status?: { privacyStatus?: string };
    liveStreamingDetails?: {
      actualStartTime?: string;
      actualEndTime?: string;
      scheduledStartTime?: string;
    };
  }>;
}

export interface VideoMetadata {
  title?: string;
  localizedTitle?: string;
  publishedAt?: string;
  privacyStatus?: string;
  thumbnails?: YoutubeThumbnails;
  isLiveBroadcast: boolean;
}

export interface YoutubeErrorResponse {
  error?: { errors?: Array<{ reason?: string }>; message?: string };
}
