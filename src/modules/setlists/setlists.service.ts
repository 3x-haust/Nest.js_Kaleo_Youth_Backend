import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import type { Request } from 'express';
import {
  paginate,
  type PaginatedResult,
} from '../../common/dto/pagination.dto';
import { sanitizePlainText } from '../../common/utils/sanitize.util';
import {
  extractYoutubePlaylistId,
  extractYoutubeVideoId,
} from '../../common/utils/youtube.util';
import {
  AuditAction,
  Setlist,
  SetlistSong,
  SetlistSyncStatus,
} from '../../entities';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { UploadsService } from '../uploads/uploads.service';
import { AttachmentOwnerType } from '../../entities';
import type { ActorInfo } from '../sermons/sermons.service';
import {
  YoutubeService,
  type PlaylistImportResult,
} from '../youtube/youtube.service';
import type {
  CreateSetlistDto,
  SetlistQueryDto,
  SetlistSongDto,
  UpdateSetlistDto,
} from './dto/setlist.dto';

@Injectable()
export class SetlistsService {
  constructor(
    @InjectRepository(Setlist)
    private readonly repository: Repository<Setlist>,
    @InjectRepository(SetlistSong)
    private readonly songRepository: Repository<SetlistSong>,
    private readonly dataSource: DataSource,
    private readonly youtube: YoutubeService,
    private readonly auditLogs: AuditLogsService,
    private readonly uploads: UploadsService,
  ) {}

  /** 유튜브 연동 가능 여부. 프론트는 이 값으로 임포트 UI 노출을 결정합니다. */
  getCapabilities() {
    return { playlistImportEnabled: this.youtube.isEnabled() };
  }

  /**
   * 저장하지 않고 미리보기만 반환합니다.
   * 저장을 하지 않더라도 유튜브 API 할당량을 소모하므로 ADMIN 전용 + 속도 제한이 걸려 있습니다.
   */
  async previewPlaylist(playlistUrl: string): Promise<PlaylistImportResult> {
    return this.youtube.importPlaylist(playlistUrl);
  }

  async findAll(query: SetlistQueryDto): Promise<PaginatedResult<Setlist>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 12;

    const builder = this.repository
      .createQueryBuilder('setlist')
      .leftJoinAndSelect('setlist.songs', 'song')
      .orderBy('setlist.serviceDate', 'DESC')
      .addOrderBy('song.displayOrder', 'ASC')
      .skip((page - 1) * limit)
      .take(limit);

    if (query.teamId) {
      builder.andWhere('setlist.teamId = :teamId', { teamId: query.teamId });
    }
    if (query.from) {
      builder.andWhere('setlist.serviceDate >= :from', { from: query.from });
    }
    if (query.to) {
      builder.andWhere('setlist.serviceDate <= :to', { to: query.to });
    }
    if (query.keyword) {
      // 콘티 제목뿐 아니라 수록곡 제목으로도 찾을 수 있게 합니다.
      builder.andWhere(
        `(setlist.title ILIKE :keyword OR EXISTS (
           SELECT 1 FROM setlist_songs s
           WHERE s.setlist_id = setlist.id AND (s.song_title ILIKE :keyword OR s.artist ILIKE :keyword)
         ))`,
        { keyword: `%${query.keyword}%` },
      );
    }

    const [items, total] = await builder.getManyAndCount();
    for (const item of items) {
      item.songs = this.sortSongs(item.songs ?? []);
    }
    return paginate(items, total, page, limit);
  }

  async findLatest(count = 3): Promise<Setlist[]> {
    const items = await this.repository.find({
      relations: { songs: true },
      order: { serviceDate: 'DESC', id: 'ASC' },
      take: count,
    });
    for (const item of items) item.songs = this.sortSongs(item.songs ?? []);
    return items;
  }

  async findOne(id: string): Promise<Setlist> {
    const setlist = await this.repository.findOne({
      where: { id },
      relations: { songs: true, team: true },
    });
    if (!setlist) throw new NotFoundException('콘티를 찾을 수 없습니다.');
    setlist.songs = this.sortSongs(setlist.songs ?? []);
    return setlist;
  }

  async create(
    dto: CreateSetlistDto,
    actor: ActorInfo,
    request: Request,
  ): Promise<Setlist> {
    const playlistId = extractYoutubePlaylistId(
      dto.youtubePlaylistUrl ?? undefined,
    );

    const setlist = this.repository.create({
      teamId: dto.teamId ?? null,
      serviceDate: dto.serviceDate.slice(0, 10),
      title: sanitizePlainText(dto.title) ?? '',
      fileUrl: dto.fileUrl ?? null,
      youtubePlaylistId: playlistId,
      youtubePlaylistTitle: sanitizePlainText(dto.youtubePlaylistTitle),
      lastSyncedAt: playlistId ? new Date() : null,
      syncStatus: playlistId
        ? SetlistSyncStatus.IMPORTED
        : SetlistSyncStatus.MANUAL,
      createdByAdminId: actor.id,
    });
    const saved = await this.repository.manager.transaction(async (manager) => {
      const repository = manager.getRepository(Setlist);
      const persisted = await repository.save(setlist);
      await this.replaceSongs(
        persisted.id,
        dto.songs,
        manager.getRepository(SetlistSong),
      );
      await this.uploads.attach(
        dto.attachmentIds,
        AttachmentOwnerType.SETLIST,
        persisted.id,
        actor.id,
        manager,
      );
      return persisted;
    });

    await this.auditLogs.record({
      action: AuditAction.SETLIST_CREATE,
      adminId: actor.id,
      adminLoginId: actor.loginId,
      targetType: 'setlist',
      targetId: saved.id,
      detail: `${saved.serviceDate} ${saved.title} (${dto.songs.length}곡${playlistId ? ', 플레이리스트 임포트' : ''})`,
      request,
    });
    return this.findOne(saved.id);
  }

  async update(
    id: string,
    dto: UpdateSetlistDto,
    actor: ActorInfo,
    request: Request,
  ): Promise<Setlist> {
    const setlist = await this.repository.manager.transaction(
      async (manager) => {
        const repository = manager.getRepository(Setlist);
        const current = await repository
          .createQueryBuilder('setlist')
          .setLock('pessimistic_write')
          .where('setlist.id = :id', { id })
          .getOne();
        if (!current) throw new NotFoundException('콘티를 찾을 수 없습니다.');

        if (dto.teamId !== undefined) current.teamId = dto.teamId || null;
        if (dto.serviceDate !== undefined)
          current.serviceDate = dto.serviceDate.slice(0, 10);
        if (dto.title !== undefined)
          current.title = sanitizePlainText(dto.title) ?? current.title;
        if (dto.fileUrl !== undefined) current.fileUrl = dto.fileUrl || null;
        if (dto.youtubePlaylistUrl !== undefined) {
          const playlistId = extractYoutubePlaylistId(
            dto.youtubePlaylistUrl ?? undefined,
          );
          current.youtubePlaylistId = playlistId;
          current.lastSyncedAt = playlistId ? new Date() : null;
          current.syncStatus = playlistId
            ? SetlistSyncStatus.IMPORTED
            : SetlistSyncStatus.MANUAL;
          if (!playlistId && dto.youtubePlaylistTitle === undefined) {
            current.youtubePlaylistTitle = null;
          }
        }
        if (dto.youtubePlaylistTitle !== undefined) {
          current.youtubePlaylistTitle = sanitizePlainText(
            dto.youtubePlaylistTitle,
          );
        }

        await repository.save(current);
        if (dto.songs !== undefined) {
          await this.replaceSongs(
            current.id,
            dto.songs,
            manager.getRepository(SetlistSong),
          );
        }
        await this.uploads.attach(
          dto.attachmentIds,
          AttachmentOwnerType.SETLIST,
          current.id,
          actor.id,
          manager,
        );
        return current;
      },
    );

    await this.auditLogs.record({
      action: AuditAction.SETLIST_UPDATE,
      adminId: actor.id,
      adminLoginId: actor.loginId,
      targetType: 'setlist',
      targetId: setlist.id,
      detail: `${setlist.serviceDate} ${setlist.title}`,
      request,
    });
    return this.findOne(setlist.id);
  }

  /**
   * 플레이리스트를 다시 읽어 곡 목록을 갱신합니다.
   * 관리자가 손으로 적어 둔 메모와 악보 링크는 영상 ID 기준으로 살려 둡니다.
   * 실패해도 기존 스냅샷은 그대로 두고 상태만 sync_failed 로 바꿉니다.
   */
  async resync(
    id: string,
    actor: ActorInfo,
    request: Request,
  ): Promise<Setlist> {
    const setlist = await this.findOne(id);
    if (!setlist.youtubePlaylistId) {
      throw new NotFoundException(
        '이 콘티에는 연결된 유튜브 플레이리스트가 없습니다.',
      );
    }

    try {
      const result = await this.youtube.importPlaylist(
        setlist.youtubePlaylistId,
      );

      const preserved = new Map(
        setlist.songs
          .filter((song) => song.youtubeVideoId)
          .map((song) => [
            song.youtubeVideoId as string,
            { note: song.note, sheetFileUrl: song.sheetFileUrl },
          ]),
      );

      const replacement = result.songs.map((song) => {
        const kept = song.youtubeVideoId
          ? preserved.get(song.youtubeVideoId)
          : undefined;
        return {
          displayOrder: song.displayOrder,
          songTitle: song.songTitle,
          artist: song.artist ?? undefined,
          youtubeUrl: song.youtubeVideoId ?? undefined,
          youtubeVideoTitle: song.youtubeVideoTitle,
          thumbnailUrl: song.thumbnailUrl ?? undefined,
          note: kept?.note ?? undefined,
          sheetFileUrl: kept?.sheetFileUrl ?? undefined,
          isUnavailable: song.isUnavailable,
        } satisfies SetlistSongDto;
      });

      setlist.youtubePlaylistTitle =
        result.playlistTitle ?? setlist.youtubePlaylistTitle;
      setlist.lastSyncedAt = new Date();
      setlist.syncStatus = SetlistSyncStatus.IMPORTED;
      await this.repository.manager.transaction(async (manager) => {
        await this.replaceSongs(
          setlist.id,
          replacement,
          manager.getRepository(SetlistSong),
        );
        await manager.getRepository(Setlist).save(setlist);
      });

      await this.auditLogs.record({
        action: AuditAction.SETLIST_RESYNC,
        adminId: actor.id,
        adminLoginId: actor.loginId,
        targetType: 'setlist',
        targetId: setlist.id,
        detail: `재동기화 성공 (${result.songs.length}곡, 확인불가 ${result.unavailableCount}곡)`,
        request,
      });
      return this.findOne(setlist.id);
    } catch (error) {
      setlist.syncStatus = SetlistSyncStatus.SYNC_FAILED;
      await this.repository.save(setlist);
      await this.auditLogs.record({
        action: AuditAction.SETLIST_RESYNC,
        adminId: actor.id,
        adminLoginId: actor.loginId,
        targetType: 'setlist',
        targetId: setlist.id,
        detail: '재동기화 실패 (기존 곡 목록은 유지됨)',
        request,
      });
      throw error;
    }
  }

  async remove(
    id: string,
    actor: ActorInfo,
    request: Request,
  ): Promise<{ success: true }> {
    const setlist = await this.findOne(id);
    const fileUrls = await this.dataSource.transaction(async (manager) => {
      const urls = await this.uploads.removeByOwner(
        AttachmentOwnerType.SETLIST,
        setlist.id,
        manager,
      );
      await manager.getRepository(Setlist).remove(setlist);
      return urls;
    });
    await this.uploads.deleteFiles(fileUrls);
    await this.auditLogs.record({
      action: AuditAction.SETLIST_DELETE,
      adminId: actor.id,
      adminLoginId: actor.loginId,
      targetType: 'setlist',
      targetId: id,
      detail: `${setlist.serviceDate} ${setlist.title}`,
      request,
    });
    return { success: true };
  }

  /**
   * 곡 목록은 부분 수정 대신 통째로 교체합니다.
   * 관리자 화면이 순서 변경·행 삭제를 자유롭게 하는 구조라 diff보다 안전하고 단순합니다.
   */
  private async replaceSongs(
    setlistId: string,
    songs: SetlistSongDto[],
    repository: Repository<SetlistSong> = this.songRepository,
  ): Promise<void> {
    await repository.delete({ setlistId });
    if (songs.length === 0) return;

    const rows = songs.map((song, index) =>
      repository.create({
        setlistId,
        displayOrder: song.displayOrder ?? index,
        // 유튜브에서 온 문자열이 섞여 있으므로 저장 시점에 한 번 더 정리합니다.
        songTitle: sanitizePlainText(song.songTitle) ?? '(제목 없음)',
        artist: sanitizePlainText(song.artist),
        youtubeVideoId: extractYoutubeVideoId(song.youtubeUrl),
        youtubeVideoTitle: sanitizePlainText(song.youtubeVideoTitle),
        thumbnailUrl: song.thumbnailUrl || null,
        note: sanitizePlainText(song.note),
        sheetFileUrl: song.sheetFileUrl || null,
        isUnavailable: song.isUnavailable ?? false,
      }),
    );
    await repository.save(rows);
  }

  private sortSongs(songs: SetlistSong[]): SetlistSong[] {
    return [...songs].sort((a, b) => a.displayOrder - b.displayOrder);
  }
}
