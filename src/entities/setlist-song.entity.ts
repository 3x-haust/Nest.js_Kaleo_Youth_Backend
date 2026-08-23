import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Setlist } from './setlist.entity';

/**
 * 콘티 내 곡 목록. 플레이리스트 임포트 결과를 관리자가 확인·수정한 확정본입니다.
 * 임포트 시점 정보를 DB에 복사(스냅샷)해 두므로, 공개 페이지 조회 시
 * 유튜브 API를 호출하지 않고 유튜브 장애나 영상 삭제와 무관하게 기록이 남습니다.
 */
@Entity('setlist_songs')
export class SetlistSong {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'setlist_id', type: 'uuid' })
  setlistId: string;

  @ManyToOne(() => Setlist, (setlist) => setlist.songs, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'setlist_id' })
  setlist: Setlist;

  /** 곡 순서. 플레이리스트 position이 초기값이고 관리자가 변경할 수 있습니다. */
  @Column({ name: 'display_order', type: 'int', default: 0 })
  displayOrder: number;

  @Index()
  @Column({ name: 'song_title', type: 'varchar', length: 300 })
  songTitle: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  artist: string | null;

  @Column({
    name: 'youtube_video_id',
    type: 'varchar',
    length: 32,
    nullable: true,
  })
  youtubeVideoId: string | null;

  /**
   * 파싱 전 원본 영상 제목.
   * 파싱 로직을 개선했을 때 기존 데이터를 재파싱하거나, 곡명이 이상하게 들어갔을 때
   * 원본과 대조하기 위해 원문 그대로 남깁니다.
   */
  @Column({
    name: 'youtube_video_title',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  youtubeVideoTitle: string | null;

  @Column({
    name: 'thumbnail_url',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  thumbnailUrl: string | null;

  /** 키/BPM/특이사항 등 관리자 메모 */
  @Column({ type: 'varchar', length: 300, nullable: true })
  note: string | null;

  @Column({
    name: 'sheet_file_url',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  sheetFileUrl: string | null;

  /** 원본 영상이 삭제/비공개로 전환된 경우 true */
  @Column({ name: 'is_unavailable', type: 'boolean', default: false })
  isUnavailable: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
