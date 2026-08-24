import { DataSource, EntityManager } from 'typeorm';
import { Setlist, SetlistSong, SetlistSyncStatus } from '../../entities';
import {
  YoutubeService,
  type PlaylistImportResult,
} from '../youtube/youtube.service';
import {
  FIXED_PLAYLIST_ID,
  FixedPlaylistSyncService,
} from './fixed-playlist-sync.service';

jest.mock('../../common/utils/sanitize.util', () => ({
  sanitizePlainText: (value: string) => value,
}));

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
  it('serializes concurrent runs and creates only one next snapshot', async () => {
    let latest = baseline();
    let importsStarted = 0;
    let releaseImports: () => void = () => undefined;
    const bothImportsStarted = new Promise<void>((resolve) => {
      releaseImports = resolve;
    });
    const youtube = {
      isEnabled: jest.fn().mockReturnValue(true),
      importPlaylist: jest.fn(async () => {
        importsStarted += 1;
        if (importsStarted === 2) releaseImports();
        await bothImportsStarted;
        return imported;
      }),
    };
    const setlistRepository = {
      findOne: jest.fn(() => Promise.resolve(latest)),
      create: jest.fn((value: Partial<Setlist>) => ({
        ...value,
        id: 'created-id',
        songs: [],
      })),
      save: jest.fn((value: Setlist) => {
        latest = value;
        return Promise.resolve(value);
      }),
    };
    const songRepository = {
      create: jest.fn((value: Partial<SetlistSong>) => value),
      save: jest.fn((songs: SetlistSong[]) => {
        latest.songs = songs;
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

    expect(results.map((result) => result.status).sort()).toEqual([
      'created',
      'unchanged',
    ]);
    expect(setlistRepository.save).toHaveBeenCalledTimes(1);
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
