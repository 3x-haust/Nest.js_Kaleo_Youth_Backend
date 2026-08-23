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
import { Admin } from './admin.entity';

/** 주일 설교 아카이브. 영상은 유튜브 임베드이므로 자체 영상 저장소가 필요 없습니다. */
@Entity('sermons')
export class Sermon {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Index()
  @Column({ name: 'preacher_name', type: 'varchar', length: 50 })
  preacherName: string;

  /** 성경 본문 (예: "요한복음 3:16-18") */
  @Column({
    name: 'bible_reference',
    type: 'varchar',
    length: 120,
    nullable: true,
  })
  bibleReference: string | null;

  /** 유튜브 영상 ID만 저장. 임베드 URL은 서버/프론트에서 조립합니다. */
  @Column({
    name: 'youtube_video_id',
    type: 'varchar',
    length: 32,
    nullable: true,
  })
  youtubeVideoId: string | null;

  thumbnailUrl?: string | null;

  posterUrl?: string | null;

  recentThumbnailUrl?: string | null;

  attachments?: import('./attachment.entity').Attachment[];

  @Column({ type: 'text', nullable: true })
  summary: string | null;

  @Index()
  @Column({ name: 'published_at', type: 'date' })
  publishedAt: string;

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
