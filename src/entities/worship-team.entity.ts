import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { WorshipTeamMember } from './worship-team-member.entity';

/** J-Teen 찬양팀. 현재는 단일 팀이지만 향후 팀 추가를 위해 테이블로 둡니다. */
@Entity('worship_team')
export class WorshipTeam {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({
    name: 'cover_image_url',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  coverImageUrl: string | null;

  /** 연습·예배 일정 안내 (자유 텍스트. 별도 캘린더 시스템을 두지 않습니다) */
  @Column({ name: 'schedule_info', type: 'text', nullable: true })
  scheduleInfo: string | null;

  @OneToMany(() => WorshipTeamMember, (member) => member.team)
  members: WorshipTeamMember[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
