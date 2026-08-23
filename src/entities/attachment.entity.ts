import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Admin } from './admin.entity';

export enum AttachmentOwnerType {
  POST = 'post',
  SETLIST = 'setlist',
  EVENT = 'event',
  SERMON = 'sermon',
  WORSHIP_TEAM = 'worship_team',
  WORSHIP_TEAM_MEMBER = 'worship_team_member',
  ABOUT_PAGE = 'about_page',
}

/** 게시글/설교/갤러리/콘티 첨부파일 (폴리모픽) */
@Entity('attachments')
@Index(['ownerType', 'ownerId'])
export class Attachment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'owner_type', type: 'enum', enum: AttachmentOwnerType })
  ownerType: AttachmentOwnerType;

  /** 업로드 직후에는 아직 소유 리소스가 없을 수 있어 nullable 입니다. */
  @Column({ name: 'owner_id', type: 'uuid', nullable: true })
  ownerId: string | null;

  @Column({ name: 'file_url', type: 'varchar', length: 500 })
  fileUrl: string;

  @Column({
    name: 'original_name',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  originalName: string | null;

  @Column({ name: 'file_type', type: 'varchar', length: 100, nullable: true })
  fileType: string | null;

  @Column({ name: 'file_size', type: 'bigint', nullable: true })
  fileSize: string | null;

  @Column({ name: 'display_order', type: 'int', default: 0 })
  displayOrder: number;

  @Column({ name: 'uploaded_by_admin_id', type: 'uuid', nullable: true })
  uploadedByAdminId: string | null;

  @ManyToOne(() => Admin, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'uploaded_by_admin_id' })
  uploadedBy: Admin | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
