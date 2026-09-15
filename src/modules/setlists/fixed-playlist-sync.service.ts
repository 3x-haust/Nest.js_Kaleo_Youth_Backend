import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataSource, LessThanOrEqual } from 'typeorm';
import {
  Setlist,
  SetlistSong,
  SetlistSyncStatus,
  WorshipTeam,
} from '../../entities';
import { YoutubeService, type ImportedSong } from '../youtube/youtube.service';

export const FIXED_PLAYLIST_IDS = [
  'PLiH1f3x84aAhtvZKpSXuxeFP8DdZZakOY',
  'PL3XAVRJqjRbZNRw7d-b49stFYz8BXrxW3',
] as const;

export const FIXED_PLAYLIST_ID = FIXED_PLAYLIST_IDS[0];

export type FixedPlaylistSyncResult =
  | FixedPlaylistSkippedResult
  | FixedPlaylistSingleResult
  | {
      readonly status: 'completed';
      readonly results: readonly FixedPlaylistSingleResult[];
    };

export type FixedPlaylistSingleResult =
  | {
      readonly status: 'skipped';
      readonly reason: 'youtube_disabled' | 'no_team';
    }
  | {
      readonly status: 'unchanged';
      readonly setlistId: string;
    }
  | {
      readonly status: 'created' | 'updated';
      readonly setlistId: string;
      readonly serviceDate: string;
      readonly songCount: number;
    };

export type FixedPlaylistSkippedResult = {
  readonly status: 'skipped';
  readonly reason: 'youtube_disabled' | 'no_team';
};

type PreservedSongMetadata = {
  readonly artist: string | null;
  readonly note: string | null;
  readonly sheetFileUrl: string | null;
};

@Injectable()
export class FixedPlaylistSyncService implements OnApplicationBootstrap {
  private readonly logger = new Logger(FixedPlaylistSyncService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly youtube: YoutubeService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (process.env.NODE_ENV === 'test') return;
    try {
      const result = await this.syncFixedPlaylist();
      this.logger.log(`Fixed playlist startup sync: ${result.status}`);
    } catch (error) {
      this.logger.error(
        'Fixed playlist startup sync failed',
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  @Cron('0 3 * * *', { timeZone: 'Asia/Seoul' })
  async syncFixedPlaylist(
    now: Date = new Date(),
  ): Promise<FixedPlaylistSyncResult> {
    if (!this.youtube.isEnabled()) {
      return { status: 'skipped', reason: 'youtube_disabled' };
    }

    const results: FixedPlaylistSingleResult[] = [];
    for (const playlistId of FIXED_PLAYLIST_IDS) {
      results.push(await this.syncOnePlaylist(playlistId, now));
    }

    return results.length === 1
      ? results[0]
      : { status: 'completed', results };
  }

  private async syncOnePlaylist(
    playlistId: string,
    now: Date,
  ): Promise<FixedPlaylistSingleResult> {
    const imported = await this.youtube.importPlaylist(playlistId);
    const currentDate = this.toSeoulCalendarDate(now);

    return this.dataSource.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        playlistId,
      ]);

      const setlistRepository = manager.getRepository(Setlist);
      let baseline = await setlistRepository.findOne({
        where: {
          youtubePlaylistId: playlistId,
          serviceDate: LessThanOrEqual(currentDate),
        },
        relations: { songs: true },
        order: { serviceDate: 'DESC', id: 'ASC' },
      });
      if (!baseline) {
        const fallback = await setlistRepository.find({
          where: {
            youtubePlaylistId: playlistId,
            serviceDate: LessThanOrEqual(currentDate),
          },
          relations: { songs: true },
          order: { serviceDate: 'DESC', id: 'ASC' },
          take: 1,
        });
        baseline = fallback[0] ?? null;
      }
      let bootstrapTeamId: string | null = null;
      if (!baseline) {
        const teams = await manager.getRepository(WorshipTeam).find({
          order: { createdAt: 'ASC', id: 'ASC' },
          take: 1,
        });
        bootstrapTeamId = teams[0]?.id ?? null;
        if (!bootstrapTeamId) {
          return { status: 'skipped', reason: 'no_team' };
        }
      }

      const serviceDate = this.nextSunday(currentDate);
      const pendingCandidate = await setlistRepository.findOne({
        where: {
          youtubePlaylistId: playlistId,
          serviceDate,
        },
        relations: { songs: true },
        order: { id: 'ASC' },
      });
      const pending =
        pendingCandidate?.serviceDate === serviceDate ? pendingCandidate : null;
      const current = pending ?? baseline;
      const importedSongs = [...imported.songs].sort(
        (left, right) => left.displayOrder - right.displayOrder,
      );
      const isSeasonalTitleUpdate =
        !pending &&
        importedSongs.length > 0 &&
        baseline !== null &&
        this.isSameSongOrder(
          baseline.songs,
          importedSongs,
          baseline.title,
          imported.playlistTitle,
        ) &&
        this.deriveTitle(baseline, imported.playlistTitle) !== baseline.title;
      if (isSeasonalTitleUpdate) {
        const renamed = await setlistRepository.save(
          Object.assign(baseline as Setlist, {
            title: this.deriveTitle(baseline, imported.playlistTitle),
          }),
        );
        return { status: 'unchanged', setlistId: renamed.id };
      }
      const currentSongs = [...(current?.songs ?? [])].sort(
        (left, right) => left.displayOrder - right.displayOrder,
      );
      const hasSameOrder = this.hasSameCanonicalOrder(
        currentSongs,
        importedSongs,
      );
      const playlistTitle =
        imported.playlistTitle ?? current?.youtubePlaylistTitle ?? null;
      if (
        current &&
        hasSameOrder &&
        this.hasSameImportedMetadata(
          current,
          currentSongs,
          importedSongs,
          playlistTitle,
        )
      ) {
        return { status: 'unchanged', setlistId: current.id };
      }

      const existing = hasSameOrder ? current : pending;
      const snapshot = existing
        ? await setlistRepository.save(
            Object.assign(existing, {
              youtubePlaylistTitle: playlistTitle,
              lastSyncedAt: now,
              syncStatus: SetlistSyncStatus.IMPORTED,
            }),
          )
        : await setlistRepository.save(
            setlistRepository.create({
              teamId: baseline?.teamId ?? bootstrapTeamId,
              serviceDate,
              title: this.deriveTitle(current, playlistTitle),
              fileUrl: null,
              youtubePlaylistId: playlistId,
              youtubePlaylistTitle: playlistTitle,
              lastSyncedAt: now,
              syncStatus: SetlistSyncStatus.IMPORTED,
              createdByAdminId: null,
            }),
          );

      const metadataQueues = this.buildPreservedMetadataQueues(currentSongs);
      const songRepository = manager.getRepository(SetlistSong);
      if (existing) {
        await songRepository.delete({ setlistId: snapshot.id });
      }
      const songs = importedSongs.map((song, displayOrder) => {
        const queue = song.youtubeVideoId
          ? metadataQueues.get(song.youtubeVideoId)
          : undefined;
        const preserved = queue?.shift();
        return songRepository.create({
          setlistId: snapshot.id,
          displayOrder,
          songTitle: song.songTitle,
          artist: preserved ? preserved.artist : song.artist,
          youtubeVideoId: song.youtubeVideoId,
          youtubeVideoTitle: song.youtubeVideoTitle,
          thumbnailUrl: song.thumbnailUrl,
          note: preserved?.note ?? null,
          sheetFileUrl: preserved?.sheetFileUrl ?? null,
          isUnavailable: song.isUnavailable,
        });
      });
      await songRepository.save(songs);

      return {
        status: existing ? 'updated' : 'created',
        setlistId: snapshot.id,
        serviceDate: snapshot.serviceDate,
        songCount: songs.length,
      };
    });
  }

  private hasSameCanonicalOrder(
    current: readonly SetlistSong[],
    imported: readonly ImportedSong[],
  ): boolean {
    if (current.length !== imported.length) return false;
    return current.every(
      (song, index) =>
        this.canonicalSong(song) === this.canonicalSong(imported[index]),
    );
  }

  private isSameSongOrder(
    current: readonly SetlistSong[],
    imported: readonly ImportedSong[],
    currentTitle: string,
    importedTitle: string | null,
  ): boolean {
    if (current.length !== imported.length) return false;
    if (currentTitle !== this.deriveTitle(null, importedTitle)) return false;
    return current.every((song, index) => {
      const candidate = imported[index];
      return (
        this.canonicalSong(song) === this.canonicalSong(candidate) &&
        song.songTitle === candidate.songTitle &&
        song.youtubeVideoTitle === candidate.youtubeVideoTitle &&
        song.thumbnailUrl === candidate.thumbnailUrl &&
        song.isUnavailable === candidate.isUnavailable
      );
    });
  }

  private canonicalSong(song: {
    readonly youtubeVideoId: string | null;
    readonly youtubeVideoTitle: string | null;
  }): string {
    return song.youtubeVideoId ?? `unavailable:${song.youtubeVideoTitle ?? ''}`;
  }

  private hasSameImportedMetadata(
    current: Setlist,
    currentSongs: readonly SetlistSong[],
    importedSongs: readonly ImportedSong[],
    playlistTitle: string | null,
  ): boolean {
    if (current.youtubePlaylistTitle !== playlistTitle) return false;
    return currentSongs.every((song, index) => {
      const imported = importedSongs[index];
      return (
        song.songTitle === imported.songTitle &&
        song.youtubeVideoTitle === imported.youtubeVideoTitle &&
        song.thumbnailUrl === imported.thumbnailUrl &&
        song.isUnavailable === imported.isUnavailable
      );
    });
  }

  private buildPreservedMetadataQueues(
    songs: readonly SetlistSong[],
  ): Map<string, PreservedSongMetadata[]> {
    const queues = new Map<string, PreservedSongMetadata[]>();
    for (const song of songs) {
      if (!song.youtubeVideoId) continue;
      const queue = queues.get(song.youtubeVideoId) ?? [];
      queue.push({
        artist: song.artist,
        note: song.note,
        sheetFileUrl: song.sheetFileUrl,
      });
      queues.set(song.youtubeVideoId, queue);
    }
    return queues;
  }

  private deriveTitle(
    current: Setlist | null,
    playlistTitle: string | null,
  ): string {
    if (current) return current.title;
    const playlistSeason = /(\d{4})\s*\uc2dc\uc98c/.exec(playlistTitle ?? '');
    if (!playlistSeason) return '주일예배 찬양 콘티';
    return `${playlistSeason[1]} 시즌 찬양 콘티`;
  }

  private toSeoulCalendarDate(value: Date): string {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(value);
    const part = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((item) => item.type === type)?.value ?? '';
    return `${part('year')}-${part('month')}-${part('day')}`;
  }

  private nextSunday(date: string): string {
    const value = new Date(`${date}T00:00:00.000Z`);
    const daysUntilNextSunday = 7 - value.getUTCDay();
    value.setUTCDate(value.getUTCDate() + daysUntilNextSunday);
    return value.toISOString().slice(0, 10);
  }
}
