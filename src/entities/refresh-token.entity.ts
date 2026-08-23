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

/**
 * Refresh Token Rotation 추적 테이블.
 * 토큰 원문은 저장하지 않고 SHA-256 해시만 보관하므로, DB가 유출돼도
 * 저장된 값만으로는 세션을 탈취할 수 없습니다.
 */
@Entity('refresh_tokens')
export class RefreshToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'admin_id', type: 'uuid' })
  adminId: string;

  @ManyToOne(() => Admin, (admin) => admin.refreshTokens, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'admin_id' })
  admin: Admin;

  @Index({ unique: true })
  @Column({ name: 'token_hash', type: 'varchar', length: 64 })
  tokenHash: string;

  @Column({ name: 'device_info', type: 'varchar', length: 255, nullable: true })
  deviceInfo: string | null;

  @Column({ name: 'ip_address', type: 'varchar', length: 64, nullable: true })
  ipAddress: string | null;

  @Column({ name: 'user_agent', type: 'varchar', length: 512, nullable: true })
  userAgent: string | null;

  @CreateDateColumn({ name: 'issued_at', type: 'timestamptz' })
  issuedAt: Date;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  /** null 이면 유효, 값이 있으면 폐기된 토큰 */
  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  /** 회전 체인 추적. 폐기된 토큰이 재사용되면 탈취로 간주하고 전 세션을 끊습니다. */
  @Column({ name: 'replaced_by_token_id', type: 'uuid', nullable: true })
  replacedByTokenId: string | null;
}
