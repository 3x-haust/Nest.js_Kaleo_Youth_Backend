import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Admin } from './admin.entity';
import { SetlistSong } from './setlist-song.entity';
import { WorshipTeam } from './worship-team.entity';

export enum SetlistSyncStatus {
  /** 관리자가 직접 곡을 입력한 콘티 */
  MANUAL = 'manual',
  /** 유튜브 플레이리스트에서 임포트한 콘티 */
  IMPORTED = 'imported',
  /** 마지막 재동기화가 실패한 상태 (저장된 스냅샷은 그대로 유효) */
  SYNC_FAILED = 'sync_failed',
}

/** 콘티/악보 자료실. 로그인 없이 누구나 열람 가능하고 작성만 ADMIN입니다. */
@Entity('setlists')
export class Setlist {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'team_id', type: 'uuid', nullable: true })
  teamId: string | null;

  @ManyToOne(() => WorshipTeam, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'team_id' })
  team: WorshipTeam | null;

  @Index()
  @Column({ name: 'service_date', type: 'date' })
  serviceDate: string;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  /** 곡별 악보와 별개로 콘티 전체를 통짜 PDF로 올리는 경우 */
  @Column({ name: 'file_url', type: 'varchar', length: 500, nullable: true })
  fileUrl: string | null;

  /** 추적 파라미터(si=)를 제거한 순수 플레이리스트 ID만 저장 */
  @Column({
    name: 'youtube_playlist_id',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  youtubePlaylistId: string | null;

  /** 임포트 시점의 플레이리스트 제목 스냅샷 */
  @Column({
    name: 'youtube_playlist_title',
    type: 'varchar',
    length: 300,
    nullable: true,
  })
  youtubePlaylistTitle: string | null;

  @Column({ name: 'last_synced_at', type: 'timestamptz', nullable: true })
  lastSyncedAt: Date | null;

  @Column({
    name: 'sync_status',
    type: 'enum',
    enum: SetlistSyncStatus,
    default: SetlistSyncStatus.MANUAL,
  })
  syncStatus: SetlistSyncStatus;

  @OneToMany(() => SetlistSong, (song) => song.setlist, { cascade: true })
  songs: SetlistSong[];

  @Column({ name: 'created_by_admin_id', type: 'uuid', nullable: true })
  createdByAdminId: string | null;

  @ManyToOne(() => Admin, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'created_by_admin_id' })
  createdBy: Admin | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
