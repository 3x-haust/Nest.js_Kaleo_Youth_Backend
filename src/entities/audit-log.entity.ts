import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export enum AuditAction {
  LOGIN_SUCCESS = 'LOGIN_SUCCESS',
  LOGIN_FAIL = 'LOGIN_FAIL',
  LOGOUT = 'LOGOUT',
  TOKEN_REFRESH = 'TOKEN_REFRESH',
  TOKEN_REUSE_DETECTED = 'TOKEN_REUSE_DETECTED',
  ADMIN_CREATE = 'ADMIN_CREATE',
  ADMIN_UPDATE = 'ADMIN_UPDATE',
  ADMIN_DEACTIVATE = 'ADMIN_DEACTIVATE',
  ADMIN_PASSWORD_RESET = 'ADMIN_PASSWORD_RESET',
  POST_CREATE = 'POST_CREATE',
  POST_UPDATE = 'POST_UPDATE',
  POST_DELETE = 'POST_DELETE',
  SERMON_CREATE = 'SERMON_CREATE',
  SERMON_UPDATE = 'SERMON_UPDATE',
  SERMON_DELETE = 'SERMON_DELETE',
  EVENT_CREATE = 'EVENT_CREATE',
  EVENT_UPDATE = 'EVENT_UPDATE',
  EVENT_DELETE = 'EVENT_DELETE',
  SETLIST_CREATE = 'SETLIST_CREATE',
  SETLIST_UPDATE = 'SETLIST_UPDATE',
  SETLIST_DELETE = 'SETLIST_DELETE',
  SETLIST_RESYNC = 'SETLIST_RESYNC',
  TEAM_UPDATE = 'TEAM_UPDATE',
  TEAM_MEMBER_CREATE = 'TEAM_MEMBER_CREATE',
  TEAM_MEMBER_UPDATE = 'TEAM_MEMBER_UPDATE',
  TEAM_MEMBER_DELETE = 'TEAM_MEMBER_DELETE',
  ABOUT_UPDATE = 'ABOUT_UPDATE',
  FILE_UPLOAD = 'FILE_UPLOAD',
}

/** 누가 언제 무엇을 변경했는지에 대한 보안 감사 로그 */
@Entity('audit_logs')
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 로그인 실패처럼 주체를 특정할 수 없는 경우 null */
  @Index()
  @Column({ name: 'admin_id', type: 'uuid', nullable: true })
  adminId: string | null;

  /** 계정이 삭제돼도 로그가 남도록 FK 대신 이름을 복사해 둡니다. */
  @Column({
    name: 'admin_login_id',
    type: 'varchar',
    length: 50,
    nullable: true,
  })
  adminLoginId: string | null;

  @Index()
  @Column({ type: 'varchar', length: 50 })
  action: AuditAction | string;

  @Column({ name: 'target_type', type: 'varchar', length: 50, nullable: true })
  targetType: string | null;

  @Column({ name: 'target_id', type: 'varchar', length: 100, nullable: true })
  targetId: string | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  detail: string | null;

  @Column({ name: 'ip_address', type: 'varchar', length: 64, nullable: true })
  ipAddress: string | null;

  @Column({ name: 'user_agent', type: 'varchar', length: 512, nullable: true })
  userAgent: string | null;

  @Index()
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
