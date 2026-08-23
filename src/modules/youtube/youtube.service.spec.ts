import { ConfigService } from '@nestjs/config';
import { YoutubeApiClient } from './youtube-api.client';
import { YoutubeService } from './youtube.service';

jest.mock('../../common/utils/sanitize.util', () => ({
  sanitizePlainText: (value: string) => value,
}));

const PLAYLIST_ID = 'PLiH1f3x84aAhtvZKpSXuxeFP8DdZZakOY';

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

function createService(): YoutubeService {
  const config = {
    get: jest.fn((key: string) => {
      if (key === 'youtube.apiKey') return 'test-api-key';
      if (key === 'youtube.timeoutMs') return 1000;
      return undefined;
    }),
  } as unknown as ConfigService;
  return new YoutubeService(new YoutubeApiClient(config));
}

describe('YoutubeService', () => {
  afterEach(() => jest.restoreAllMocks());

  it('imports every playlistItems page in playlist order', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation((input) => {
      const url = requestUrl(input);
      if (url.pathname.endsWith('/playlists')) {
        return Promise.resolve(
          jsonResponse({ items: [{ snippet: { title: 'Weekly Worship' } }] }),
        );
      }
      if (url.searchParams.get('pageToken') === 'page-2') {
        return Promise.resolve(
          jsonResponse({
            items: [
              {
                snippet: {
                  title: 'Second Song',
                  position: 1,
                  resourceId: { videoId: 'video-2' },
                },
              },
            ],
          }),
        );
      }
      return Promise.resolve(
        jsonResponse({
          nextPageToken: 'page-2',
          items: [
            {
              snippet: {
                title: 'First Song',
                position: 0,
                resourceId: { videoId: 'video-1' },
              },
            },
          ],
        }),
      );
    });

    const result = await createService().importPlaylist(PLAYLIST_ID);

    expect(result.songs.map((song) => song.youtubeVideoId)).toEqual([
      'video-1',
      'video-2',
    ]);
    expect(
      fetchSpy.mock.calls.filter(([input]) =>
        requestUrl(input).pathname.includes('/playlistItems'),
      ),
    ).toHaveLength(2);
  });

  it('enriches titles and thumbnails from localized videos.list metadata', async () => {
    jest.spyOn(global, 'fetch').mockImplementation((input) => {
      const url = requestUrl(input);
      if (url.pathname.endsWith('/playlists')) {
        return Promise.resolve(jsonResponse({ items: [] }));
      }
      if (url.pathname.endsWith('/videos')) {
        expect(url.searchParams.get('hl')).toBe('ko');
        expect(url.searchParams.get('part')).toBe('snippet');
        return Promise.resolve(
          jsonResponse({
            items: [
              {
                id: 'localized-video',
                snippet: {
                  title: 'English API Title',
                  localized: { title: '한국어 제목' },
                  thumbnails: {
                    default: { url: 'https://i.ytimg.com/default.jpg' },
                    medium: { url: 'https://i.ytimg.com/medium.jpg' },
                    high: { url: 'https://i.ytimg.com/high.jpg' },
                    standard: { url: 'https://i.ytimg.com/standard.jpg' },
                    maxres: { url: 'https://i.ytimg.com/maxres.jpg' },
                  },
                },
              },
              {
                id: 'english-video',
                snippet: {
                  title: 'English Only Title',
                  thumbnails: {
                    high: { url: 'https://i.ytimg.com/english-high.jpg' },
                  },
                },
              },
            ],
          }),
        );
      }
      return Promise.resolve(
        jsonResponse({
          items: [
            {
              snippet: {
                title: 'Original Localized Title',
                position: 0,
                resourceId: { videoId: 'localized-video' },
              },
            },
            {
              snippet: {
                title: 'Original English Title',
                position: 1,
                resourceId: { videoId: 'english-video' },
              },
            },
          ],
        }),
      );
    });

    const result = await createService().importPlaylist(PLAYLIST_ID);

    expect(
      result.songs.map(({ youtubeVideoTitle, thumbnailUrl }) => ({
        youtubeVideoTitle,
        thumbnailUrl,
      })),
    ).toEqual([
      {
        youtubeVideoTitle: '한국어 제목',
        thumbnailUrl: 'https://i.ytimg.com/maxres.jpg',
      },
      {
        youtubeVideoTitle: 'Original English Title',
        thumbnailUrl: 'https://i.ytimg.com/english-high.jpg',
      },
    ]);
  });

  it('batches videos.list requests at 50 IDs and preserves playlist order', async () => {
    const playlistItems = Array.from({ length: 51 }, (_, position) => ({
      snippet: {
        title: `Song ${position}`,
        position,
        resourceId: { videoId: `video-${position}` },
      },
    }));
    const videoBatchSizes: number[] = [];
    jest.spyOn(global, 'fetch').mockImplementation((input) => {
      const url = requestUrl(input);
      if (url.pathname.endsWith('/playlists')) {
        return Promise.resolve(jsonResponse({ items: [] }));
      }
      if (url.pathname.endsWith('/videos')) {
        const ids = url.searchParams.get('id')?.split(',') ?? [];
        videoBatchSizes.push(ids.length);
        return Promise.resolve(
          jsonResponse({
            items: ids.reverse().map((id) => ({ id, snippet: { title: id } })),
          }),
        );
      }
      return Promise.resolve(jsonResponse({ items: playlistItems }));
    });

    const result = await createService().importPlaylist(PLAYLIST_ID);

    expect(videoBatchSizes).toEqual([50, 1]);
    expect(result.songs.map((song) => song.youtubeVideoId)).toEqual(
      playlistItems.map((item) => item.snippet.resourceId.videoId),
    );
  });

  it('stops when YouTube repeats a page token', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation((input) => {
      const url = requestUrl(input);
      if (url.pathname.endsWith('/playlists')) {
        return Promise.resolve(jsonResponse({ items: [] }));
      }
      const secondPage = url.searchParams.get('pageToken') === 'repeated-token';
      return Promise.resolve(
        jsonResponse({
          nextPageToken: 'repeated-token',
          items: [
            {
              snippet: {
                title: secondPage ? 'Second Song' : 'First Song',
                position: secondPage ? 1 : 0,
                resourceId: { videoId: secondPage ? 'video-2' : 'video-1' },
              },
            },
          ],
        }),
      );
    });

    const result = await createService().importPlaylist(PLAYLIST_ID);

    expect(result.songs).toHaveLength(2);
    expect(
      fetchSpy.mock.calls.filter(([input]) =>
        requestUrl(input).pathname.includes('/playlistItems'),
      ),
    ).toHaveLength(2);
  });
});
