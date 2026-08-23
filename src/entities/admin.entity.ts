import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { RefreshToken } from './refresh-token.entity';

/**
 * 이 사이트에 존재하는 유일한 계정 테이블입니다.
 * 학생·학부모 등 일반 방문자는 계정을 갖지 않으므로(GUEST 열람 전용),
 * 여기에 저장되는 개인정보는 성인 사역자의 이름/로그인 정보뿐입니다.
 */
@Entity('admins')
export class Admin {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ name: 'login_id', type: 'varchar', length: 50 })
  loginId: string;

  /** argon2id 해시. 평문은 어떤 경우에도 저장하지 않습니다. */
  @Column({
    name: 'password_hash',
    type: 'varchar',
    length: 255,
    select: false,
  })
  passwordHash: string;

  @Column({ type: 'varchar', length: 50 })
  name: string;

  /** 표시용 직책 라벨. 권한과 무관합니다 (예: "찬양팀 인도자") */
  @Column({
    name: 'position_label',
    type: 'varchar',
    length: 50,
    nullable: true,
  })
  positionLabel: string | null;

  /** 다른 관리자 계정을 생성/비활성화할 수 있는지 여부 */
  @Column({ name: 'is_super_admin', type: 'boolean', default: false })
  isSuperAdmin: boolean;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'last_login_at', type: 'timestamptz', nullable: true })
  lastLoginAt: Date | null;

  /** 이 시각 이전에 발급한 access token을 즉시 무효화합니다. */
  @Column({ name: 'auth_invalidated_at', type: 'timestamptz', nullable: true })
  authInvalidatedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @OneToMany(() => RefreshToken, (token) => token.admin)
  refreshTokens: RefreshToken[];
}
