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
import { WorshipTeam } from './worship-team.entity';

/**
 * 팀원 소개용 프로필 데이터일 뿐, 로그인 계정이 아닙니다.
 * 연락처·생년월일 등 식별 정보를 두지 않고 소개 문구 수준만 저장합니다.
 */
@Entity('worship_team_members')
export class WorshipTeamMember {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'team_id', type: 'uuid' })
  teamId: string;

  @ManyToOne(() => WorshipTeam, (team) => team.members, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'team_id' })
  team: WorshipTeam;

  @Column({ type: 'varchar', length: 50 })
  name: string;

  /** 보컬 / 건반 / 드럼 / 일렉 / 베이스 / 인도 등 */
  @Column({ type: 'varchar', length: 50, nullable: true })
  part: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  bio: string | null;

  @Column({ name: 'photo_url', type: 'varchar', length: 500, nullable: true })
  photoUrl: string | null;

  @Column({ name: 'display_order', type: 'int', default: 0 })
  displayOrder: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
