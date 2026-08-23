import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import {
  hash as hashPassword,
  verify as verifyPassword,
} from '@node-rs/argon2';
import { Repository } from 'typeorm';
import type { Request } from 'express';
import { Admin, AuditAction } from '../../entities';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AuthService } from '../auth/auth.service';
import {
  ChangePasswordDto,
  CreateAdminDto,
  PASSWORD_RULE,
  ResetPasswordDto,
  UpdateAdminDto,
} from './dto/admin.dto';

@Injectable()
export class AdminsService implements OnModuleInit {
  private readonly logger = new Logger(AdminsService.name);

  constructor(
    @InjectRepository(Admin) private readonly repository: Repository<Admin>,
    private readonly configService: ConfigService,
    private readonly auditLogsService: AuditLogsService,
    private readonly authService: AuthService,
  ) {}

  /**
   * 셀프 회원가입 화면이 없으므로, 최초 1회 슈퍼관리자를 여기서 만들어 줍니다.
   * 이미 계정이 하나라도 있으면 아무것도 하지 않습니다.
   */
  async onModuleInit() {
    const existing = await this.repository.count();
    if (existing > 0) return;

    const seed = this.configService.get<{
      loginId: string;
      password: string;
      name: string;
    }>('seed');

    if (!seed?.loginId || !seed?.password) {
      this.logger.warn(
        '관리자 계정이 없고 SEED_SUPER_ADMIN_* 환경변수도 비어 있어 시딩을 건너뜁니다.',
      );
      return;
    }

    if (!PASSWORD_RULE.test(seed.password)) {
      this.logger.error(
        'SEED_SUPER_ADMIN_PASSWORD 가 비밀번호 규칙(10자 이상, 영문·숫자·특수문자 포함)에 맞지 않아 시딩하지 않았습니다.',
      );
      return;
    }

    await this.repository.save(
      this.repository.create({
        loginId: seed.loginId,
        passwordHash: await hashPassword(seed.password),
        name: seed.name,
        positionLabel: '최고관리자',
        isSuperAdmin: true,
        isActive: true,
      }),
    );

    this.logger.log(
      `최초 슈퍼관리자 계정을 생성했습니다 (loginId=${seed.loginId}). 로그인 후 비밀번호를 즉시 변경하세요.`,
    );
  }

  async findAll() {
    return this.repository.find({
      order: { isSuperAdmin: 'DESC', createdAt: 'ASC' },
    });
  }

  async findOne(id: string) {
    const admin = await this.repository.findOne({ where: { id } });
    if (!admin) throw new NotFoundException('관리자 계정을 찾을 수 없습니다.');
    return admin;
  }

  async create(
    dto: CreateAdminDto,
    actor: { id: string; loginId: string },
    request: Request,
  ) {
    const duplicate = await this.repository.findOne({
      where: { loginId: dto.loginId },
    });
    if (duplicate) throw new ConflictException('이미 사용 중인 아이디입니다.');

    const created = await this.repository.save(
      this.repository.create({
        loginId: dto.loginId,
        passwordHash: await hashPassword(dto.password),
        name: dto.name,
        positionLabel: dto.positionLabel ?? null,
        isSuperAdmin: dto.isSuperAdmin ?? false,
        isActive: true,
      }),
    );

    await this.auditLogsService.record({
      action: AuditAction.ADMIN_CREATE,
      adminId: actor.id,
      adminLoginId: actor.loginId,
      targetType: 'admin',
      targetId: created.id,
      detail: `${created.loginId} 계정 생성`,
      request,
    });

    return this.findOne(created.id);
  }

  async update(
    id: string,
    dto: UpdateAdminDto,
    actor: { id: string; loginId: string },
    request: Request,
  ) {
    const admin = await this.findOne(id);

    // 마지막 슈퍼관리자를 잠가버리면 아무도 계정을 관리할 수 없게 되므로 막습니다.
    if (
      admin.isSuperAdmin &&
      (dto.isSuperAdmin === false || dto.isActive === false)
    ) {
      const activeSupers = await this.repository.count({
        where: { isSuperAdmin: true, isActive: true },
      });
      if (activeSupers <= 1) {
        throw new BadRequestException(
          '활성 상태의 슈퍼관리자가 최소 한 명은 있어야 합니다.',
        );
      }
    }

    Object.assign(admin, {
      name: dto.name ?? admin.name,
      positionLabel: dto.positionLabel ?? admin.positionLabel,
      isSuperAdmin: dto.isSuperAdmin ?? admin.isSuperAdmin,
      isActive: dto.isActive ?? admin.isActive,
    });
    await this.repository.save(admin);

    // 비활성화된 계정이 기존 토큰으로 계속 활동하지 못하도록 세션을 즉시 끊습니다.
    if (dto.isActive === false) {
      await this.authService.revokeAllSessions(admin.id);
    }

    await this.auditLogsService.record({
      action:
        dto.isActive === false
          ? AuditAction.ADMIN_DEACTIVATE
          : AuditAction.ADMIN_UPDATE,
      adminId: actor.id,
      adminLoginId: actor.loginId,
      targetType: 'admin',
      targetId: admin.id,
      detail: `${admin.loginId} 계정 수정`,
      request,
    });

    return this.findOne(admin.id);
  }

  /** 슈퍼관리자가 비밀번호를 재발급합니다 (셀프 비밀번호 찾기 대신 채택한 방식). */
  async resetPassword(
    id: string,
    dto: ResetPasswordDto,
    actor: { id: string; loginId: string },
    request: Request,
  ) {
    const admin = await this.findOne(id);
    await this.repository.update(admin.id, {
      passwordHash: await hashPassword(dto.newPassword),
      authInvalidatedAt: new Date(),
    });
    await this.authService.revokeAllSessions(admin.id);

    await this.auditLogsService.record({
      action: AuditAction.ADMIN_PASSWORD_RESET,
      adminId: actor.id,
      adminLoginId: actor.loginId,
      targetType: 'admin',
      targetId: admin.id,
      detail: `${admin.loginId} 비밀번호 재발급`,
      request,
    });

    return {
      message:
        '비밀번호를 재발급했습니다. 해당 계정의 모든 세션이 종료되었습니다.',
    };
  }

  async changeOwnPassword(
    adminId: string,
    dto: ChangePasswordDto,
    request: Request,
  ) {
    const admin = await this.repository
      .createQueryBuilder('admin')
      .addSelect('admin.passwordHash')
      .where('admin.id = :adminId', { adminId })
      .getOne();

    if (!admin) throw new NotFoundException('관리자 계정을 찾을 수 없습니다.');

    const matches = await verifyPassword(
      admin.passwordHash,
      dto.currentPassword,
    ).catch(() => false);
    if (!matches) {
      throw new UnauthorizedException('현재 비밀번호가 올바르지 않습니다.');
    }
    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException('현재 비밀번호와 다른 값을 입력해주세요.');
    }

    await this.repository.update(admin.id, {
      passwordHash: await hashPassword(dto.newPassword),
      authInvalidatedAt: new Date(),
    });
    await this.authService.revokeAllSessions(admin.id);

    await this.auditLogsService.record({
      action: AuditAction.ADMIN_PASSWORD_RESET,
      adminId: admin.id,
      adminLoginId: admin.loginId,
      targetType: 'admin',
      targetId: admin.id,
      detail: '본인 비밀번호 변경',
      request,
    });

    return { message: '비밀번호를 변경했습니다. 다시 로그인해주세요.' };
  }
}
