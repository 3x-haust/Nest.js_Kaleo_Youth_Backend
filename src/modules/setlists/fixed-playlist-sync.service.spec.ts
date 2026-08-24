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
  FixedPlaylistSyncService,
} from './fixed-playlist-sync.service';

jest.mock('../../common/utils/sanitize.util', () => ({
  sanitizePlainText: (value: string) => value,
}));

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

function importResult(videoIds: readonly string[]): PlaylistImportResult {
  return {
    playlistId: FIXED_PLAYLIST_ID,
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
  const setlistRepository = {
    findOne: jest.fn().mockResolvedValue(latest),
    find: jest.fn().mockResolvedValue(latest ? [latest] : []),
    create: jest.fn((value: Partial<Setlist>) => ({
      ...value,
      id: 'created-id',
    })),
    save: jest.fn((value: Setlist) => Promise.resolve(value)),
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
    importPlaylist: jest.fn().mockResolvedValue(result),
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
  };
}

describe('FixedPlaylistSyncService', () => {
  it('skips without fetching when YouTube integration is disabled', async () => {
    const harness = createHarness(baseline(['a']));
    harness.youtube.isEnabled.mockReturnValue(false);

    const result = await harness.service.syncFixedPlaylist();

    expect(result).toEqual({
      status: 'skipped',
      reason: 'youtube_disabled',
    });
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

    expect(result).toEqual({
      status: 'created',
      setlistId: 'created-id',
      serviceDate: '2026-08-30',
      songCount: 2,
    });
    expect(harness.youtube.importPlaylist).toHaveBeenCalledWith(
      FIXED_PLAYLIST_ID,
    );
    expect(harness.setlistRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        teamId: 'team-id',
        serviceDate: '2026-08-30',
        title: '주일 예배 콘티',
        youtubePlaylistId: FIXED_PLAYLIST_ID,
      }),
    );
  });

  it('bootstraps from the worship team when no setlist exists', async () => {
    const harness = createHarness(null);

    const result = await harness.service.syncFixedPlaylist(
      new Date('2026-08-23T03:00:00+09:00'),
    );

    expect(result).toEqual({
      status: 'created',
      setlistId: 'created-id',
      serviceDate: '2026-08-30',
      songCount: 1,
    });
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

    expect(result).toEqual({ status: 'skipped', reason: 'no_team' });
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

    expect(result).toEqual({
      status: 'unchanged',
      setlistId: 'baseline-id',
    });
    expect(harness.setlistRepository.save).not.toHaveBeenCalled();
  });

  it('refreshes enriched metadata on the baseline without creating next week', async () => {
    const latest = baseline(['same-video']);
    latest.youtubePlaylistTitle = 'Old English Playlist';
    latest.songs[0].songTitle = 'Old English Song';
    latest.songs[0].youtubeVideoTitle = 'Old English Video';
    latest.songs[0].thumbnailUrl = 'https://img.example/low.jpg';
    latest.songs[0].isUnavailable = true;
    latest.songs[0].artist = 'Preserved artist';
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
    const harness = createHarness(latest, enriched);
    harness.songRepository.save.mockImplementation((songs) => {
      latest.songs = songs;
      return Promise.resolve(songs);
    });

    await expect(
      harness.service.syncFixedPlaylist(new Date('2026-08-23T03:00:00+09:00')),
    ).resolves.toEqual({
      status: 'updated',
      setlistId: 'baseline-id',
      serviceDate: '2026-08-23',
      songCount: 1,
    });
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
    ).resolves.toEqual({
      status: 'unchanged',
      setlistId: 'baseline-id',
    });
    expect(harness.setlistRepository.create).not.toHaveBeenCalled();
    expect(harness.setlistRepository.save).toHaveBeenCalledTimes(1);
  });

  it('targets the next Seoul Sunday from now despite a legacy Thursday baseline', async () => {
    const legacyBaseline = baseline(['a']);
    legacyBaseline.serviceDate = '2026-08-20';
    const snapshots = [legacyBaseline];
    let nextId = 1;
    let remote = importResult(['a', 'b']);
    const setlistRepository = {
      findOne: jest.fn(
        (options: {
          where: { serviceDate?: string | { _value: string } };
        }): Promise<Setlist | null> => {
          const condition = options.where.serviceDate;
          const matching = snapshots
            .filter(
              (snapshot) => snapshot.youtubePlaylistId === FIXED_PLAYLIST_ID,
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
      find: jest.fn().mockResolvedValue([]),
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
    const manager = {
      query: jest.fn().mockResolvedValue(undefined),
      getRepository: jest.fn((entity: typeof Setlist | typeof SetlistSong) =>
        entity === Setlist ? setlistRepository : songRepository,
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
      importPlaylist: jest.fn(() => Promise.resolve(remote)),
    };
    const service = new FixedPlaylistSyncService(
      dataSource as unknown as DataSource,
      youtube as unknown as YoutubeService,
    );
    const syncAt = (timestamp: string) =>
      service.syncFixedPlaylist(new Date(timestamp));

    await expect(syncAt('2026-08-23T00:00:00+09:00')).resolves.toEqual(
      expect.objectContaining({
        status: 'created',
        setlistId: 'created-1',
        serviceDate: '2026-08-30',
      }),
    );

    remote = importResult(['a', 'c']);
    await expect(syncAt('2026-08-27T03:00:00+09:00')).resolves.toEqual(
      expect.objectContaining({
        status: 'updated',
        setlistId: 'created-1',
        serviceDate: '2026-08-30',
      }),
    );
    expect(snapshots.map((snapshot) => snapshot.serviceDate)).toEqual([
      '2026-08-20',
      '2026-08-30',
    ]);

    await expect(syncAt('2026-08-28T03:00:00+09:00')).resolves.toEqual({
      status: 'unchanged',
      setlistId: 'created-1',
    });

    remote = importResult(['a', 'd']);
    await expect(syncAt('2026-08-30T00:00:00+09:00')).resolves.toEqual(
      expect.objectContaining({
        status: 'created',
        setlistId: 'created-2',
        serviceDate: '2026-09-06',
      }),
    );
    expect(snapshots.map((snapshot) => snapshot.serviceDate)).toEqual([
      '2026-08-20',
      '2026-08-30',
      '2026-09-06',
    ]);
  });

  it('creates the next week and queues duplicate metadata matches', async () => {
    const events: string[] = [];
    const latest = baseline(['duplicate', 'duplicate', 'new']);
    latest.songs[0].artist = 'Preserved artist 0';
    latest.songs[1].artist = 'Preserved artist 1';
    latest.songs[2].artist = 'Preserved artist 2';
    const harness = createHarness(
      latest,
      importResult(['duplicate', 'new', 'duplicate']),
    );
    harness.youtube.importPlaylist.mockImplementation(() => {
      events.push('prefetch');
      return Promise.resolve(importResult(['duplicate', 'new', 'duplicate']));
    });
    harness.dataSource.transaction.mockImplementation((callback) => {
      events.push('transaction');
      return callback(harness.manager as unknown as EntityManager);
    });

    const result = await harness.service.syncFixedPlaylist(
      new Date('2026-08-23T03:00:00+09:00'),
    );

    expect(result).toEqual({
      status: 'created',
      setlistId: 'created-id',
      serviceDate: '2026-08-30',
      songCount: 3,
    });
    expect(events).toEqual(['prefetch', 'transaction']);
    expect(harness.manager.query).toHaveBeenCalledWith(
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      [FIXED_PLAYLIST_ID],
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
    expect(harness.songRepository.save).toHaveBeenCalledWith([
      expect.objectContaining({
        displayOrder: 0,
        artist: 'Preserved artist 0',
        note: 'note-0',
        sheetFileUrl: '/sheets/0.pdf',
      }),
      expect.objectContaining({
        displayOrder: 1,
        artist: 'Preserved artist 2',
        note: 'note-2',
        sheetFileUrl: '/sheets/2.pdf',
      }),
      expect.objectContaining({
        displayOrder: 2,
        artist: 'Preserved artist 1',
        note: 'note-1',
        sheetFileUrl: '/sheets/1.pdf',
      }),
    ]);
  });
});
