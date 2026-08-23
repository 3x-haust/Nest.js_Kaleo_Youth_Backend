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

export enum BoardType {
  NOTICE = 'notice',
  GALLERY = 'gallery',
}

/**
 * 공지사항 + 갤러리 통합 게시판.
 * 작성은 ADMIN만 가능하고 댓글/사용자 투고가 없으므로, 사용자 생성 콘텐츠 리스크가 없습니다.
 */
@Entity('posts')
export class Post {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'board_type', type: 'enum', enum: BoardType })
  boardType: BoardType;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  /** 저장 시점에 새니타이징된 HTML */
  @Column({ type: 'text', nullable: true })
  content: string | null;

  /** 갤러리 목록 썸네일 (첨부 이미지 중 대표) */
  @Column({
    name: 'thumbnail_url',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  thumbnailUrl: string | null;

  @Index()
  @Column({ name: 'start_date', type: 'date', nullable: true })
  startDate: string | null;

  @Column({ name: 'end_date', type: 'date', nullable: true })
  endDate: string | null;

  @Column({ name: 'is_pinned', type: 'boolean', default: false })
  isPinned: boolean;

  @Column({ name: 'view_count', type: 'int', default: 0 })
  viewCount: number;

  @Column({ name: 'author_admin_id', type: 'uuid', nullable: true })
  authorAdminId: string | null;

  @ManyToOne(() => Admin, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'author_admin_id' })
  author: Admin | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
