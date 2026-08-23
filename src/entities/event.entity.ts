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

/**
 * 행사·수련회 "안내" 전용 테이블입니다.
 * 온라인 신청/결제/학부모 동의 기능이 없으므로 참가자 데이터는 저장되지 않습니다.
 */
@Entity('events')
export class ChurchEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Index()
  @Column({ name: 'start_date', type: 'date' })
  startDate: string;

  @Column({ name: 'end_date', type: 'date', nullable: true })
  endDate: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  location: string | null;

  /** 준비물 안내 (자유 텍스트) */
  @Column({ name: 'items_to_bring', type: 'text', nullable: true })
  itemsToBring: string | null;

  /** 대략적 참가비 안내 텍스트. 결제 기능이 없으므로 금액 숫자로 다루지 않습니다. */
  @Column({ name: 'fee_info', type: 'varchar', length: 200, nullable: true })
  feeInfo: string | null;

  /** 문의 방법 (전화/카카오톡 채널/담당 교사 등) */
  @Column({
    name: 'contact_info',
    type: 'varchar',
    length: 200,
    nullable: true,
  })
  contactInfo: string | null;

  @Column({
    name: 'cover_image_url',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  coverImageUrl: string | null;

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
