import { DataSource, EntityManager } from 'typeorm';
import { Setlist, SetlistSong, SetlistSyncStatus } from '../../entities';
import {
  YoutubeService,
  type PlaylistImportResult,
} from '../youtube/youtube.service';
import {
  FIXED_PLAYLIST_ID,
  FIXED_PLAYLIST_IDS,
  FixedPlaylistSyncService,
} from './fixed-playlist-sync.service';

jest.mock('../../common/utils/sanitize.util', () => ({
  sanitizePlainText: (value: string) => value,
}));

const SECONDARY_PLAYLIST_ID = FIXED_PLAYLIST_IDS[1];

const imported: PlaylistImportResult = {
  playlistId: FIXED_PLAYLIST_ID,
  playlistTitle: 'Fixed Playlist',
  songs: [
    {
      displayOrder: 0,
      songTitle: 'New Song',
      artist: null,
      youtubeVideoId: 'new',
      youtubeVideoTitle: 'New Song',
      thumbnailUrl: null,
      isUnavailable: false,
    },
  ],
  unavailableCount: 0,
};

function baseline(): Setlist {
  return {
    id: 'baseline-id',
    teamId: null,
    team: null,
    serviceDate: '2026-08-23',
    title: '주일 예배 콘티',
    fileUrl: null,
    youtubePlaylistId: FIXED_PLAYLIST_ID,
    youtubePlaylistTitle: 'Fixed Playlist',
    lastSyncedAt: new Date(),
    syncStatus: SetlistSyncStatus.IMPORTED,
    songs: [
      {
        id: 'old-song',
        setlistId: 'baseline-id',
        setlist: null as unknown as Setlist,
        displayOrder: 0,
        songTitle: 'Old Song',
        artist: null,
        youtubeVideoId: 'old',
        youtubeVideoTitle: 'Old Song',
        thumbnailUrl: null,
        note: null,
        sheetFileUrl: null,
        isUnavailable: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
    createdByAdminId: null,
    createdBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('FixedPlaylistSyncService scheduling and concurrency', () => {
  it('serializes concurrent runs and creates one next snapshot per playlist', async () => {
    const latestByPlaylist = new Map<string, Setlist>([
      [FIXED_PLAYLIST_ID, baseline()],
      [SECONDARY_PLAYLIST_ID, { ...baseline(), id: 'baseline-id-2' }],
    ]);
    const startedIds: string[] = [];
    const youtube = {
      isEnabled: jest.fn().mockReturnValue(true),
      importPlaylist: jest.fn((playlistId: string) => {
        startedIds.push(playlistId);
        return Promise.resolve({ ...imported, playlistId });
      }),
    };
    const setlistRepository = {
      findOne: jest.fn((options: { where: { youtubePlaylistId: string } }) =>
        Promise.resolve(latestByPlaylist.get(options.where.youtubePlaylistId) ?? null),
      ),
      create: jest.fn((value: Partial<Setlist>) => ({
        ...value,
        id: `created-${value.youtubePlaylistId === FIXED_PLAYLIST_ID ? 'a' : 'b'}`,
        songs: [],
      })),
      save: jest.fn((value: Setlist) => {
        latestByPlaylist.set(value.youtubePlaylistId ?? '', value);
        return Promise.resolve(value);
      }),
    };
    const songRepository = {
      create: jest.fn((value: Partial<SetlistSong>) => value),
      save: jest.fn((songs: SetlistSong[]) => {
        const target = songs[0]?.setlistId;
        for (const snapshot of latestByPlaylist.values()) {
          if (snapshot.id === target) snapshot.songs = songs;
        }
        return Promise.resolve(songs);
      }),
    };
    const manager = {
      query: jest.fn().mockResolvedValue(undefined),
      getRepository: jest.fn((entity: typeof Setlist | typeof SetlistSong) =>
        entity === Setlist ? setlistRepository : songRepository,
      ),
    };
    let transactionTail = Promise.resolve();
    const dataSource = {
      transaction: jest.fn(
        async (callback: (manager: EntityManager) => Promise<unknown>) => {
          const previous = transactionTail;
          let releaseTransaction: () => void = () => undefined;
          transactionTail = new Promise<void>((resolve) => {
            releaseTransaction = resolve;
          });
          await previous;
          try {
            return await callback(manager as unknown as EntityManager);
          } finally {
            releaseTransaction();
          }
        },
      ),
    };
    const service = new FixedPlaylistSyncService(
      dataSource as unknown as DataSource,
      youtube as unknown as YoutubeService,
    );

    const results = await Promise.all([
      service.syncFixedPlaylist(),
      service.syncFixedPlaylist(),
    ]);

    expect(startedIds).toEqual([
      FIXED_PLAYLIST_ID,
      FIXED_PLAYLIST_ID,
      SECONDARY_PLAYLIST_ID,
      SECONDARY_PLAYLIST_ID,
    ]);
    expect(
      results.flatMap((result) =>
        'results' in result
          ? result.results.map((item) => item.status)
          : [result.status],
      ),
    ).toEqual(['created', 'created', 'unchanged', 'unchanged']);
    expect(setlistRepository.save).toHaveBeenCalledTimes(2);
    expect(
      setlistRepository.create.mock.calls.map(([value]) => ({
        playlistId: value.youtubePlaylistId,
        serviceDate: value.serviceDate,
        title: value.title,
      })),
    ).toEqual([
      {
        playlistId: FIXED_PLAYLIST_ID,
        serviceDate: '2026-09-20',
        title: '주일 예배 콘티',
      },
      {
        playlistId: SECONDARY_PLAYLIST_ID,
        serviceDate: '2026-09-20',
        title: '주일 예배 콘티',
      },
    ]);
  });

  it('does not enter a transaction when playlist prefetch fails', async () => {
    const dataSource = { transaction: jest.fn() };
    const youtube = {
      isEnabled: jest.fn().mockReturnValue(true),
      importPlaylist: jest
        .fn()
        .mockRejectedValue(new Error('YouTube unavailable')),
    };
    const service = new FixedPlaylistSyncService(
      dataSource as unknown as DataSource,
      youtube as unknown as YoutubeService,
    );

    await expect(service.syncFixedPlaylist()).rejects.toThrow(
      'YouTube unavailable',
    );
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('declares a daily 03:00 Asia/Seoul cron schedule', () => {
    const syncFixedPlaylist = Object.getOwnPropertyDescriptor(
      FixedPlaylistSyncService.prototype,
      'syncFixedPlaylist',
    )?.value as object;
    const metadata: unknown = Reflect.getMetadata(
      'SCHEDULE_CRON_OPTIONS',
      syncFixedPlaylist,
    );

    expect(metadata).toEqual(
      expect.objectContaining({
        cronTime: '0 3 * * *',
        timeZone: 'Asia/Seoul',
      }),
    );
  });

  it('synchronizes once when the application starts', async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const dataSource = { transaction: jest.fn() };
    const youtube = {
      isEnabled: jest.fn().mockReturnValue(false),
    };
    const service = new FixedPlaylistSyncService(
      dataSource as unknown as DataSource,
      youtube as unknown as YoutubeService,
    );
    const sync = jest.spyOn(service, 'syncFixedPlaylist').mockResolvedValue({
      status: 'skipped',
      reason: 'youtube_disabled',
    });

    try {
      await service.onApplicationBootstrap();
      expect(sync).toHaveBeenCalledTimes(1);
    } finally {
      process.env.NODE_ENV = previousNodeEnv;
    }
  });
});
