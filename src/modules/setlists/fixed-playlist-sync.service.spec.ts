import { DataSource, EntityManager } from 'typeorm';
import {
  Setlist,
  SetlistSong,
  SetlistSyncStatus,
  WorshipTeam,
} from '../../entities';
import {
  YoutubeService,
  type ImportedSong,
  type PlaylistImportResult,
} from '../youtube/youtube.service';
import {
  FIXED_PLAYLIST_ID,
  FIXED_PLAYLIST_IDS,
  FixedPlaylistSyncService,
  type FixedPlaylistSingleResult,
} from './fixed-playlist-sync.service';

jest.mock('../../common/utils/sanitize.util', () => ({
  sanitizePlainText: (value: string) => value,
}));

const SECONDARY_PLAYLIST_ID = FIXED_PLAYLIST_IDS[1];

function singleResult(
  result: FixedPlaylistSingleResult,
): FixedPlaylistSingleResult[] {
  return [result, result];
}

function completed(
  ...results: FixedPlaylistSingleResult[]
): { status: 'completed'; results: FixedPlaylistSingleResult[] } {
  return { status: 'completed', results };
}

function synced(
  primary: FixedPlaylistSingleResult,
  secondary: FixedPlaylistSingleResult,
  advanced: FixedPlaylistSingleResult[] = [],
): { status: 'completed'; results: FixedPlaylistSingleResult[] } {
  return completed(primary, secondary, ...advanced);
}

function importedSong(
  youtubeVideoId: string,
  displayOrder: number,
): ImportedSong {
  return {
    displayOrder,
    songTitle: `Song ${displayOrder}`,
    artist: `Artist ${displayOrder}`,
    youtubeVideoId,
    youtubeVideoTitle: `Video ${displayOrder}`,
    thumbnailUrl: null,
    isUnavailable: false,
  };
}

function importResult(
  videoIds: readonly string[],
  playlistId: string = FIXED_PLAYLIST_ID,
): PlaylistImportResult {
  return {
    playlistId,
    playlistTitle: 'Fixed Playlist',
    songs: videoIds.map(importedSong),
    unavailableCount: 0,
  };
}

function baseline(videoIds: readonly string[]): Setlist {
  return {
    id: 'baseline-id',
    teamId: 'team-id',
    team: null,
    serviceDate: '2026-08-23',
    title: '주일 예배 콘티',
    fileUrl: '/uploads/old-setlist.pdf',
    youtubePlaylistId: FIXED_PLAYLIST_ID,
    youtubePlaylistTitle: 'Old Playlist Title',
    lastSyncedAt: new Date('2026-08-16T03:00:00+09:00'),
    syncStatus: SetlistSyncStatus.IMPORTED,
    songs: videoIds.map((youtubeVideoId, displayOrder) => ({
      id: `song-${displayOrder}`,
      setlistId: 'baseline-id',
      setlist: null as unknown as Setlist,
      displayOrder,
      songTitle: `Old Song ${displayOrder}`,
      artist: null,
      youtubeVideoId,
      youtubeVideoTitle: `Video ${displayOrder}`,
      thumbnailUrl: null,
      note: `note-${displayOrder}`,
      sheetFileUrl: `/sheets/${displayOrder}.pdf`,
      isUnavailable: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
    createdByAdminId: 'admin-id',
    createdBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function createHarness(latest: Setlist | null, result = importResult(['a'])) {
  const snapshots = latest ? [latest] : [];
  let nextId = 1;
  const setlistRepository = {
    findOne: jest.fn(
      (options: {
        where: { youtubePlaylistId?: string; serviceDate?: unknown };
      }): Promise<Setlist | null> => {
        const playlistId = options.where.youtubePlaylistId;
        const matches = snapshots.filter((snapshot) =>
          playlistId ? snapshot.youtubePlaylistId === playlistId : true,
        );
        return Promise.resolve(matches[matches.length - 1] ?? null);
      },
    ),
    find: jest.fn(
      (options: {
        where?: { youtubePlaylistId?: string; serviceDate?: unknown };
      }): Promise<Setlist[]> => {
        const where = options?.where ?? {};
        const playlistId = where.youtubePlaylistId;
        const serviceDate = where.serviceDate;
        const matches = snapshots.filter((snapshot) => {
          if (playlistId && snapshot.youtubePlaylistId !== playlistId)
            return false;
          if (typeof serviceDate === 'string')
            return snapshot.serviceDate === serviceDate;
          if (serviceDate)
            return snapshot.serviceDate <= (serviceDate as { _value: string })._value;
          return true;
        });
        return Promise.resolve(matches);
      },
    ),
    create: jest.fn((value: Partial<Setlist>) => ({
      ...value,
      id: `created-${nextId++}`,
      songs: [],
    })),
    save: jest.fn((value: Setlist) => {
      const index = snapshots.findIndex((snapshot) => snapshot.id === value.id);
      if (index === -1) snapshots.push(value);
      else snapshots[index] = value;
      return Promise.resolve(value);
    }),
  };
  const songRepository = {
    create: jest.fn((value: Partial<SetlistSong>) => value),
    delete: jest.fn().mockResolvedValue({ affected: 1, raw: [] }),
    save: jest.fn((value: SetlistSong[]) => Promise.resolve(value)),
  };
  const teamRepository = {
    find: jest.fn().mockResolvedValue([{ id: 'team-id' } as WorshipTeam]),
  };
  const manager = {
    query: jest.fn().mockResolvedValue(undefined),
    getRepository: jest.fn(
      (entity: typeof Setlist | typeof SetlistSong | typeof WorshipTeam) =>
        entity === Setlist
          ? setlistRepository
          : entity === SetlistSong
            ? songRepository
            : teamRepository,
    ),
  };
  const dataSource = {
    transaction: jest.fn(
      (
        callback: (manager: EntityManager) => Promise<unknown>,
      ): Promise<unknown> => callback(manager as unknown as EntityManager),
    ),
  };
  const youtube = {
    isEnabled: jest.fn().mockReturnValue(true),
    importPlaylist: jest.fn((playlistId: string) =>
      Promise.resolve(
        playlistId === FIXED_PLAYLIST_ID
          ? result
          : importResult(result.songs.map((song) => song.youtubeVideoId ?? 'x'), playlistId),
      ),
    ),
  };
  const service = new FixedPlaylistSyncService(
    dataSource as unknown as DataSource,
    youtube as unknown as YoutubeService,
  );
  return {
    service,
    dataSource,
    youtube,
    manager,
    setlistRepository,
    songRepository,
    teamRepository,
    snapshots,
  };
}

describe('FixedPlaylistSyncService', () => {
  it('skips without fetching when YouTube integration is disabled', async () => {
    const harness = createHarness(baseline(['a']));
    harness.youtube.isEnabled.mockReturnValue(false);

    const result = await harness.service.syncFixedPlaylist();

    expect(result).toEqual({ status: 'skipped', reason: 'youtube_disabled' });
    expect(harness.youtube.importPlaylist).not.toHaveBeenCalled();
    expect(harness.dataSource.transaction).not.toHaveBeenCalled();
  });

  it('bootstraps the fixed playlist from the latest ordinary setlist', async () => {
    const template = baseline([]);
    template.youtubePlaylistId = null;
    template.youtubePlaylistTitle = null;
    template.syncStatus = SetlistSyncStatus.MANUAL;
    const harness = createHarness(null, importResult(['first', 'second']));
    harness.setlistRepository.find.mockResolvedValue([template]);

    const result = await harness.service.syncFixedPlaylist(
      new Date('2026-08-23T03:00:00+09:00'),
    );

    expect(result).toEqual(
      synced(
        {
          status: 'created',
          setlistId: 'created-1',
          serviceDate: '2026-08-30',
          songCount: 2,
        },
        {
          status: 'created',
          setlistId: 'created-2',
          serviceDate: '2026-08-30',
          songCount: 2,
        },
      ),
    );
    expect(harness.youtube.importPlaylist).toHaveBeenNthCalledWith(
      1,
      FIXED_PLAYLIST_ID,
    );
    expect(harness.youtube.importPlaylist).toHaveBeenNthCalledWith(
      2,
      SECONDARY_PLAYLIST_ID,
    );
    expect(harness.setlistRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        teamId: 'team-id',
        serviceDate: '2026-08-30',
        title: '주일 예배 콘티',
        youtubePlaylistId: FIXED_PLAYLIST_ID,
      }),
    );
    expect(harness.setlistRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        youtubePlaylistId: SECONDARY_PLAYLIST_ID,
      }),
    );
  });

  it('bootstraps from the worship team when no setlist exists', async () => {
    const harness = createHarness(null);

    const result = await harness.service.syncFixedPlaylist(
      new Date('2026-08-23T03:00:00+09:00'),
    );

    expect(result).toEqual(
      synced(
        {
          status: 'created',
          setlistId: 'created-1',
          serviceDate: '2026-08-30',
          songCount: 1,
        },
        {
          status: 'created',
          setlistId: 'created-2',
          serviceDate: '2026-08-30',
          songCount: 1,
        },
      ),
    );
    expect(harness.setlistRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        teamId: 'team-id',
        serviceDate: '2026-08-30',
        title: '주일예배 찬양 콘티',
        youtubePlaylistId: FIXED_PLAYLIST_ID,
      }),
    );
  });

  it('skips only when no worship team exists', async () => {
    const harness = createHarness(null);
    harness.teamRepository.find.mockResolvedValue([]);

    const result = await harness.service.syncFixedPlaylist(
      new Date('2026-08-23T03:00:00+09:00'),
    );

    expect(result).toEqual(
      synced(
        { status: 'skipped', reason: 'no_team' },
        { status: 'skipped', reason: 'no_team' },
      ),
    );
    expect(harness.setlistRepository.save).not.toHaveBeenCalled();
  });

  it('does nothing when ordered IDs and imported metadata are unchanged', async () => {
    const latest = baseline(['duplicate', 'duplicate', 'last']);
    latest.youtubePlaylistTitle = 'Fixed Playlist';
    latest.songs.forEach((song, index) => {
      song.songTitle = `Song ${index}`;
      song.artist = `Preserved artist ${index}`;
    });
    latest.songs = [latest.songs[2], latest.songs[0], latest.songs[1]];
    const harness = createHarness(
      latest,
      importResult(['duplicate', 'duplicate', 'last']),
    );

    const result = await harness.service.syncFixedPlaylist(
      new Date('2026-08-23T03:00:00+09:00'),
    );

    expect(result).toEqual(
      synced(
        { status: 'unchanged', setlistId: 'baseline-id' },
        {
          status: 'created',
          setlistId: 'created-1',
          serviceDate: '2026-08-30',
          songCount: 3,
        },
      ),
    );
    expect(harness.setlistRepository.save).toHaveBeenCalledTimes(1);
  });

  it('refreshes enriched metadata on the baseline without creating next week', async () => {
    const primary = baseline(['same-video']);
    primary.youtubePlaylistTitle = 'Old English Playlist';
    primary.songs[0].songTitle = 'Old English Song';
    primary.songs[0].youtubeVideoTitle = 'Old English Video';
    primary.songs[0].thumbnailUrl = 'https://img.example/low.jpg';
    primary.songs[0].isUnavailable = true;
    primary.songs[0].artist = 'Preserved artist';
    const latest = primary;
    const secondary = baseline(['secondary-video']);
    secondary.id = 'secondary-id';
    secondary.youtubePlaylistId = SECONDARY_PLAYLIST_ID;
    secondary.youtubePlaylistTitle = 'Fixed Playlist';
    secondary.songs.forEach((song) => {
      song.setlistId = 'secondary-id';
      song.songTitle = 'Song 0';
      song.artist = 'Preserved artist';
    });
    const enriched = importResult(['same-video']);
    enriched.playlistTitle = '현지화된 플레이리스트';
    enriched.songs[0] = {
      ...enriched.songs[0],
      songTitle: '현지화된 곡',
      artist: 'Imported artist must not replace manual metadata',
      youtubeVideoTitle: '현지화된 영상 제목',
      thumbnailUrl: 'https://img.example/high.jpg',
      isUnavailable: false,
    };
    const harness = createHarness(primary, enriched);
    harness.youtube.importPlaylist.mockImplementation(
      (playlistId: string) =>
        Promise.resolve(
          playlistId === FIXED_PLAYLIST_ID
            ? enriched
            : importResult(['secondary-video'], playlistId),
        ),
    );
    const byPlaylist = new Map<string, Setlist>([
      [FIXED_PLAYLIST_ID, primary],
      [SECONDARY_PLAYLIST_ID, secondary],
    ]);
    harness.setlistRepository.find.mockImplementation(
      (options: {
        where: { youtubePlaylistId: string };
      }): Promise<Setlist[]> =>
        Promise.resolve(
          options.where.youtubePlaylistId === FIXED_PLAYLIST_ID
            ? [primary]
            : [],
        ),
    );
    harness.setlistRepository.findOne.mockImplementation(
      (options: {
        where: { youtubePlaylistId?: string };
      }): Promise<Setlist | null> =>
        Promise.resolve(
          byPlaylist.get(options.where.youtubePlaylistId ?? '') ?? null,
        ),
    );
    harness.songRepository.save.mockImplementation((songs) => {
      latest.songs = songs;
      return Promise.resolve(songs);
    });

    await expect(
      harness.service.syncFixedPlaylist(new Date('2026-08-23T03:00:00+09:00')),
    ).resolves.toEqual(
      completed(
        {
          status: 'updated',
          setlistId: 'baseline-id',
          serviceDate: '2026-08-23',
          songCount: 1,
        },
        {
          status: 'unchanged',
          setlistId: 'secondary-id',
        },
      ),
    );
    expect(harness.setlistRepository.create).not.toHaveBeenCalled();
    expect(harness.setlistRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'baseline-id',
        serviceDate: '2026-08-23',
        youtubePlaylistTitle: '현지화된 플레이리스트',
      }),
    );
    expect(harness.songRepository.delete).toHaveBeenCalledWith({
      setlistId: 'baseline-id',
    });
    expect(harness.songRepository.save).toHaveBeenCalledWith([
      expect.objectContaining({
        setlistId: 'baseline-id',
        songTitle: '현지화된 곡',
        artist: 'Preserved artist',
        youtubeVideoTitle: '현지화된 영상 제목',
        thumbnailUrl: 'https://img.example/high.jpg',
        note: 'note-0',
        sheetFileUrl: '/sheets/0.pdf',
        isUnavailable: false,
      }),
    ]);

    await expect(
      harness.service.syncFixedPlaylist(new Date('2026-08-24T03:00:00+09:00')),
    ).resolves.toEqual(
      completed(
        { status: 'unchanged', setlistId: 'baseline-id' },
        {
          status: 'unchanged',
          setlistId: 'secondary-id',
        },
      ),
    );
    expect(harness.setlistRepository.create).not.toHaveBeenCalled();
    expect(harness.songRepository.save).toHaveBeenCalledTimes(1);
  });

  it('creates a separate setlist for each fixed playlist and keeps it on the primary baseline', async () => {
    const primaryBaseline = baseline(['a']);
    primaryBaseline.serviceDate = '2026-08-20';
    const snapshots: Setlist[] = [primaryBaseline];
    let nextId = 1;
    const remote = importResult(['a', 'b']);
    const setlistRepository = {
      findOne: jest.fn(
        (options: {
          where: {
            youtubePlaylistId?: string;
            serviceDate?: string | { _value: string };
          };
        }): Promise<Setlist | null> => {
          const condition = options.where.serviceDate;
          const matching = snapshots
            .filter(
              (snapshot) =>
                snapshot.youtubePlaylistId === options.where.youtubePlaylistId,
            )
            .filter((snapshot) => {
              if (typeof condition === 'string') {
                return snapshot.serviceDate === condition;
              }
              return condition
                ? snapshot.serviceDate <= condition._value
                : true;
            })
            .sort((left, right) =>
              right.serviceDate.localeCompare(left.serviceDate),
            );
          return Promise.resolve(matching[0] ?? null);
        },
      ),
      find: jest
        .fn()
        .mockImplementation(
          (options: {
            where: { youtubePlaylistId: string };
          }): Promise<Setlist[]> =>
            Promise.resolve(
              options.where.youtubePlaylistId === FIXED_PLAYLIST_ID
                ? snapshots
                : [],
            ),
        ),
      create: jest.fn((value: Partial<Setlist>) => ({
        ...value,
        id: `created-${nextId++}`,
        songs: [],
      })),
      save: jest.fn((value: Setlist) => {
        const index = snapshots.findIndex(
          (snapshot) => snapshot.id === value.id,
        );
        if (index === -1) snapshots.push(value);
        else snapshots[index] = value;
        return Promise.resolve(value);
      }),
    };
    const songRepository = {
      create: jest.fn((value: Partial<SetlistSong>) => value),
      delete: jest.fn(({ setlistId }: { setlistId: string }) => {
        const snapshot = snapshots.find((item) => item.id === setlistId);
        if (snapshot) snapshot.songs = [];
        return Promise.resolve({ affected: 1, raw: [] });
      }),
      save: jest.fn((songs: SetlistSong[]) => {
        const snapshot = snapshots.find(
          (item) => item.id === songs[0]?.setlistId,
        );
        if (snapshot) snapshot.songs = songs;
        return Promise.resolve(songs);
      }),
    };
    const teamRepository = {
      find: jest.fn().mockResolvedValue([{ id: 'team-id' }]),
    };
    const manager = {
      query: jest.fn().mockResolvedValue(undefined),
      getRepository: jest.fn(
        (entity: typeof Setlist | typeof SetlistSong | typeof WorshipTeam) =>
          entity === Setlist
            ? setlistRepository
            : entity === SetlistSong
              ? songRepository
              : teamRepository,
      ),
    };
    const dataSource = {
      transaction: jest.fn(
        (callback: (manager: EntityManager) => Promise<unknown>) =>
          callback(manager as unknown as EntityManager),
      ),
    };
    const youtube = {
      isEnabled: jest.fn().mockReturnValue(true),
      importPlaylist: jest.fn((playlistId: string) =>
        Promise.resolve(
          playlistId === FIXED_PLAYLIST_ID
            ? remote
            : importResult(['secondary'], playlistId),
        ),
      ),
    };
    const service = new FixedPlaylistSyncService(
      dataSource as unknown as DataSource,
      youtube as unknown as YoutubeService,
    );
    const completedResults = async (timestamp: string) => {
      const result = await service.syncFixedPlaylist(new Date(timestamp));
      if (result.status !== 'completed') {
        throw new Error(`expected completed, received ${result.status}`);
      }
      return result.results;
    };
    const primaryAt = async (timestamp: string) =>
      (await completedResults(timestamp))[0];
    const secondaryAt = async (timestamp: string) =>
      (await completedResults(timestamp))[1];

    await expect(primaryAt('2026-08-23T00:00:00+09:00')).resolves.toEqual(
      expect.objectContaining({
        status: 'created',
        setlistId: 'created-1',
        serviceDate: '2026-08-30',
      }),
    );
    expect(primaryBaseline.title).toBe('주일 예배 콘티');

    await expect(secondaryAt('2026-08-23T00:00:00+09:00')).resolves.toEqual({
      status: 'unchanged',
      setlistId: 'created-2',
    });
    expect(
      snapshots.map((snapshot) =>
        [
          snapshot.serviceDate,
          snapshot.youtubePlaylistId,
          snapshot.title,
        ].join(' '),
      ),
    ).toEqual([
      '2026-08-20 PLiH1f3x84aAhtvZKpSXuxeFP8DdZZakOY 주일 예배 콘티',
      '2026-08-30 PLiH1f3x84aAhtvZKpSXuxeFP8DdZZakOY 주일 예배 콘티',
      '2026-08-30 PL3XAVRJqjRbZNRw7d-b49stFYz8BXrxW3 주일예배 찬양 콘티',
    ]);
  });

  it('creates the next week and queues duplicate metadata matches', async () => {
    const events: string[] = [];
    const latest = baseline(['duplicate', 'duplicate', 'new']);
    latest.songs[0].artist = 'Preserved artist 0';
    latest.songs[1].artist = 'Preserved artist 1';
    latest.songs[2].artist = 'Preserved artist 2';
    const remote = importResult(['duplicate', 'new', 'duplicate']);
    const harness = createHarness(latest, remote);
    harness.youtube.importPlaylist.mockImplementation(
      (playlistId: string) => {
        events.push('prefetch');
        return Promise.resolve({ ...remote, playlistId });
      },
    );
    harness.dataSource.transaction.mockImplementation((callback) => {
      events.push('transaction');
      return callback(harness.manager as unknown as EntityManager);
    });

    const result = await harness.service.syncFixedPlaylist(
      new Date('2026-08-23T03:00:00+09:00'),
    );

    expect(result).toEqual(
      completed(
        {
          status: 'created',
          setlistId: 'created-1',
          serviceDate: '2026-08-30',
          songCount: 3,
        },
        {
          status: 'created',
          setlistId: 'created-2',
          serviceDate: '2026-08-30',
          songCount: 3,
        },
      ),
    );
    expect(events).toEqual(['prefetch', 'transaction', 'prefetch', 'transaction']);
    expect(harness.manager.query).toHaveBeenCalledWith(
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      [FIXED_PLAYLIST_ID],
    );
    expect(harness.manager.query).toHaveBeenCalledWith(
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      [SECONDARY_PLAYLIST_ID],
    );
    expect(harness.setlistRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceDate: '2026-08-30',
        fileUrl: null,
        youtubePlaylistId: FIXED_PLAYLIST_ID,
        syncStatus: SetlistSyncStatus.IMPORTED,
        createdByAdminId: null,
      }),
    );
    expect(harness.setlistRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceDate: '2026-08-30',
        fileUrl: null,
        youtubePlaylistId: SECONDARY_PLAYLIST_ID,
        syncStatus: SetlistSyncStatus.IMPORTED,
        createdByAdminId: null,
      }),
    );
    expect(harness.setlistRepository.create).toHaveBeenCalledTimes(2);
    const savedCalls = harness.songRepository.save.mock.calls as [
      SetlistSong[],
    ][];
    const preservedSongs = (setlistId: string) =>
      (savedCalls.find(([songs]) => songs[0]?.setlistId === setlistId)?.[0] ?? []).map(
        (song: SetlistSong) => ({
          displayOrder: song.displayOrder,
          artist: song.artist,
          note: song.note,
          sheetFileUrl: song.sheetFileUrl,
        }),
      );
    expect(preservedSongs('created-1')).toEqual([
      {
        displayOrder: 0,
        artist: 'Preserved artist 0',
        note: 'note-0',
        sheetFileUrl: '/sheets/0.pdf',
      },
      {
        displayOrder: 1,
        artist: 'Preserved artist 2',
        note: 'note-2',
        sheetFileUrl: '/sheets/2.pdf',
      },
      {
        displayOrder: 2,
        artist: 'Preserved artist 1',
        note: 'note-1',
        sheetFileUrl: '/sheets/1.pdf',
      },
    ]);
    expect(savedCalls).toHaveLength(2);
  });
});
