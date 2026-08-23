import { ConfigService } from '@nestjs/config';
import { YoutubeApiClient } from './youtube-api.client';
import { YoutubeChannelService } from './youtube-channel.service';

jest.mock('../../common/utils/sanitize.util', () => ({
  sanitizePlainText: (value: string) => value,
}));

function jsonResponse(body: object): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function requestUrl(input: RequestInfo | URL): URL {
  if (input instanceof URL) return input;
  return new URL(typeof input === 'string' ? input : input.url);
}

function createService(): YoutubeChannelService {
  const config = {
    get: jest.fn((key: string) => {
      if (key === 'youtube.apiKey') return 'test-api-key';
      if (key === 'youtube.timeoutMs') return 1000;
      return undefined;
    }),
  } as unknown as ConfigService;
  return new YoutubeChannelService(new YoutubeApiClient(config));
}

describe('YoutubeChannelService', () => {
  afterEach(() => jest.restoreAllMocks());

  it('resolves a configured @handle through channels.list', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation((input) => {
      const url = requestUrl(input);
      expect(url.pathname).toBe('/youtube/v3/channels');
      expect(url.searchParams.get('part')).toBe('contentDetails');
      expect(url.searchParams.get('forHandle')).toBe('@kaleo-youth');
      expect(url.searchParams.has('id')).toBe(false);
      return Promise.resolve(
        jsonResponse({
          items: [
            {
              id: 'UC1234567890123456789012',
              contentDetails: {
                relatedPlaylists: { uploads: 'UU1234567890123456789012' },
              },
            },
          ],
        }),
      );
    });

    await expect(
      createService().resolveChannel('https://www.youtube.com/@kaleo-youth'),
    ).resolves.toEqual({
      channelId: 'UC1234567890123456789012',
      uploadsPlaylistId: 'UU1234567890123456789012',
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('returns only public recent uploads with Korean titles and highest thumbnails', async () => {
    jest.spyOn(global, 'fetch').mockImplementation((input) => {
      const url = requestUrl(input);
      if (url.pathname.endsWith('/channels')) {
        return Promise.resolve(
          jsonResponse({
            items: [
              {
                id: 'UC1234567890123456789012',
                contentDetails: {
                  relatedPlaylists: { uploads: 'UU1234567890123456789012' },
                },
              },
            ],
          }),
        );
      }
      if (url.pathname.endsWith('/videos')) {
        expect(url.searchParams.get('hl')).toBe('ko');
        expect(url.searchParams.get('part')).toBe(
          'snippet,status,liveStreamingDetails',
        );
        return Promise.resolve(
          jsonResponse({
            items: [
              {
                id: 'public-video',
                snippet: {
                  title: 'English title',
                  localized: { title: '한국어 설교 제목' },
                  publishedAt: '2026-08-22T15:30:00Z',
                  thumbnails: {
                    high: { url: 'https://i.ytimg.com/high.jpg' },
                    maxres: { url: 'https://i.ytimg.com/maxres.jpg' },
                  },
                },
                status: { privacyStatus: 'public' },
              },
              {
                id: 'private-video',
                snippet: {
                  title: 'Private video',
                  publishedAt: '2026-08-21T00:00:00Z',
                },
                status: { privacyStatus: 'private' },
              },
            ],
          }),
        );
      }
      expect(url.pathname).toContain('/search');
      expect(url.searchParams.get('maxResults')).toBe('50');
      expect(url.searchParams.get('channelId')).toBe(
        'UC1234567890123456789012',
      );
      expect(url.searchParams.get('type')).toBe('video');
      expect(url.searchParams.get('order')).toBe('date');
      return Promise.resolve(
        jsonResponse({
          items: [
            { id: { videoId: 'public-video' } },
            { id: { videoId: 'private-video' } },
          ],
        }),
      );
    });

    await expect(
      createService().getLatestChannelUploads('@kaleo-youth', 50),
    ).resolves.toEqual([
      {
        youtubeVideoId: 'public-video',
        title: '한국어 설교 제목',
        publishedAt: '2026-08-22T15:30:00Z',
        thumbnailUrl: 'https://i.ytimg.com/maxres.jpg',
      },
    ]);
  });

  it('excludes livestreams and archived live broadcasts from channel uploads', async () => {
    jest.spyOn(global, 'fetch').mockImplementation((input) => {
      const url = requestUrl(input);
      if (url.pathname.endsWith('/channels')) {
        return Promise.resolve(
          jsonResponse({
            items: [
              {
                id: 'UC1234567890123456789012',
                contentDetails: {
                  relatedPlaylists: { uploads: 'UU1234567890123456789012' },
                },
              },
            ],
          }),
        );
      }
      if (url.pathname.endsWith('/videos')) {
        return Promise.resolve(
          jsonResponse({
            items: [
              {
                id: 'ordinary-video',
                snippet: {
                  title: '일반 설교 영상',
                  publishedAt: '2026-08-23T03:00:00Z',
                },
                status: { privacyStatus: 'public' },
              },
              {
                id: 'archived-live',
                snippet: {
                  title: '주일예배 라이브 다시보기',
                  publishedAt: '2026-08-23T02:00:00Z',
                },
                status: { privacyStatus: 'public' },
                liveStreamingDetails: {
                  actualStartTime: '2026-08-23T01:00:00Z',
                  actualEndTime: '2026-08-23T02:00:00Z',
                },
              },
            ],
          }),
        );
      }
      return Promise.resolve(
        jsonResponse({
          items: [
            { id: { videoId: 'ordinary-video' } },
            { id: { videoId: 'archived-live' } },
          ],
        }),
      );
    });

    await expect(
      createService().getLatestChannelUploads('@kaleo-youth', 50),
    ).resolves.toEqual([
      {
        youtubeVideoId: 'ordinary-video',
        title: '일반 설교 영상',
        publishedAt: '2026-08-23T03:00:00Z',
        thumbnailUrl: null,
      },
    ]);
  });

  it('returns no videos for a channel before its first upload', async () => {
    jest.spyOn(global, 'fetch').mockImplementation((input) => {
      const url = requestUrl(input);
      if (url.pathname.endsWith('/channels')) {
        return Promise.resolve(
          jsonResponse({
            items: [
              {
                id: 'UC1234567890123456789012',
                contentDetails: {
                  relatedPlaylists: { uploads: 'UU1234567890123456789012' },
                },
              },
            ],
          }),
        );
      }
      if (url.pathname.endsWith('/search')) {
        expect(url.searchParams.get('channelId')).toBe(
          'UC1234567890123456789012',
        );
        expect(url.searchParams.get('type')).toBe('video');
        expect(url.searchParams.get('order')).toBe('date');
        return Promise.resolve(jsonResponse({ items: [] }));
      }
      throw new Error(`Unexpected YouTube endpoint: ${url.pathname}`);
    });

    await expect(
      createService().getLatestChannelUploads('@kaleo-youth', 50),
    ).resolves.toEqual([]);
  });
});
