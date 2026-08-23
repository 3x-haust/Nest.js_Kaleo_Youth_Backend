import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { Request } from 'express';
import {
  sanitizePlainText,
  sanitizeRichText,
} from '../../common/utils/sanitize.util';
import {
  AttachmentOwnerType,
  AuditAction,
  WorshipTeam,
  WorshipTeamMember,
} from '../../entities';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { UploadsService } from '../uploads/uploads.service';
import type { ActorInfo } from '../sermons/sermons.service';
import type {
  CreateMemberDto,
  UpdateMemberDto,
  UpdateTeamDto,
} from './dto/worship-team.dto';

/** 기획서상 청소년부 산하 찬양팀은 J-Teen 하나입니다. */
const DEFAULT_TEAM_NAME = 'J-Teen';

@Injectable()
export class WorshipTeamService implements OnModuleInit {
  constructor(
    @InjectRepository(WorshipTeam)
    private readonly teamRepository: Repository<WorshipTeam>,
    @InjectRepository(WorshipTeamMember)
    private readonly memberRepository: Repository<WorshipTeamMember>,
    private readonly auditLogs: AuditLogsService,
    private readonly uploads: UploadsService,
  ) {}

  /** 팀이 하나도 없으면 J-Teen 기본 레코드를 만들어 둡니다. */
  async onModuleInit(): Promise<void> {
    const count = await this.teamRepository.count();
    if (count > 0) return;
    await this.teamRepository.save(
      this.teamRepository.create({
        name: DEFAULT_TEAM_NAME,
        description: '수도교회 청소년부 찬양팀 J-Teen 입니다.',
        scheduleInfo:
          '주일 오전 10:00 예배 찬양 인도 / 연습 일정은 공지사항을 확인해 주세요.',
      }),
    );
  }

  async findAll(): Promise<WorshipTeam[]> {
    return this.teamRepository.find({
      relations: { members: true },
      order: { createdAt: 'ASC' },
    });
  }

  /** 공개 페이지는 단일 팀만 보여주므로 대표 팀을 반환합니다. */
  async findPrimary(): Promise<WorshipTeam> {
    const teams = await this.findAll();
    if (teams.length === 0)
      throw new NotFoundException('찬양팀 정보가 없습니다.');
    const team = teams[0];
    team.members = this.sortMembers(team.members ?? []);
    return team;
  }

  async findOne(id: string): Promise<WorshipTeam> {
    const team = await this.teamRepository.findOne({
      where: { id },
      relations: { members: true },
    });
    if (!team) throw new NotFoundException('찬양팀을 찾을 수 없습니다.');
    team.members = this.sortMembers(team.members ?? []);
    return team;
  }

  async updateTeam(
    id: string,
    dto: UpdateTeamDto,
    actor: ActorInfo,
    request: Request,
  ): Promise<WorshipTeam> {
    const team = await this.findOne(id);

    if (dto.name !== undefined)
      team.name = sanitizePlainText(dto.name) ?? team.name;
    if (dto.description !== undefined)
      team.description = sanitizeRichText(dto.description);
    if (dto.coverImageUrl !== undefined)
      team.coverImageUrl = dto.coverImageUrl || null;
    if (dto.scheduleInfo !== undefined)
      team.scheduleInfo = sanitizeRichText(dto.scheduleInfo);

    const saved = await this.teamRepository.save(team);
    await this.uploads.attach(
      dto.attachmentIds,
      AttachmentOwnerType.WORSHIP_TEAM,
      saved.id,
      actor.id,
    );
    await this.auditLogs.record({
      action: AuditAction.TEAM_UPDATE,
      adminId: actor.id,
      adminLoginId: actor.loginId,
      targetType: 'worship_team',
      targetId: saved.id,
      detail: saved.name,
      request,
    });
    return this.findOne(saved.id);
  }

  async addMember(
    teamId: string,
    dto: CreateMemberDto,
    actor: ActorInfo,
    request: Request,
  ): Promise<WorshipTeamMember> {
    await this.findOne(teamId);

    const member = this.memberRepository.create({
      teamId,
      name: sanitizePlainText(dto.name) ?? '',
      part: sanitizePlainText(dto.part),
      bio: sanitizePlainText(dto.bio),
      photoUrl: dto.photoUrl ?? null,
      displayOrder: dto.displayOrder ?? (await this.nextDisplayOrder(teamId)),
    });
    const saved = await this.memberRepository.save(member);
    saved.photoUrl = await this.bindMemberPhoto(
      saved,
      dto.attachmentIds,
      actor.id,
    );
    if (dto.attachmentIds?.length) await this.memberRepository.save(saved);

    await this.auditLogs.record({
      action: AuditAction.TEAM_MEMBER_CREATE,
      adminId: actor.id,
      adminLoginId: actor.loginId,
      targetType: 'worship_team_member',
      targetId: saved.id,
      detail: saved.name,
      request,
    });
    return saved;
  }

  async updateMember(
    memberId: string,
    dto: UpdateMemberDto,
    actor: ActorInfo,
    request: Request,
  ): Promise<WorshipTeamMember> {
    const member = await this.memberRepository.findOne({
      where: { id: memberId },
    });
    if (!member) throw new NotFoundException('팀원을 찾을 수 없습니다.');

    if (dto.name !== undefined)
      member.name = sanitizePlainText(dto.name) ?? member.name;
    if (dto.part !== undefined) member.part = sanitizePlainText(dto.part);
    if (dto.bio !== undefined) member.bio = sanitizePlainText(dto.bio);
    if (dto.photoUrl !== undefined) member.photoUrl = dto.photoUrl || null;
    if (dto.displayOrder !== undefined) member.displayOrder = dto.displayOrder;

    const saved = await this.memberRepository.save(member);
    saved.photoUrl = await this.bindMemberPhoto(
      saved,
      dto.attachmentIds,
      actor.id,
    );
    if (dto.attachmentIds?.length) await this.memberRepository.save(saved);
    await this.auditLogs.record({
      action: AuditAction.TEAM_MEMBER_UPDATE,
      adminId: actor.id,
      adminLoginId: actor.loginId,
      targetType: 'worship_team_member',
      targetId: saved.id,
      detail: saved.name,
      request,
    });
    return saved;
  }

  async removeMember(
    memberId: string,
    actor: ActorInfo,
    request: Request,
  ): Promise<{ success: true }> {
    const member = await this.memberRepository.findOne({
      where: { id: memberId },
    });
    if (!member) throw new NotFoundException('팀원을 찾을 수 없습니다.');

    await this.memberRepository.remove(member);
    await this.auditLogs.record({
      action: AuditAction.TEAM_MEMBER_DELETE,
      adminId: actor.id,
      adminLoginId: actor.loginId,
      targetType: 'worship_team_member',
      targetId: memberId,
      detail: member.name,
      request,
    });
    return { success: true };
  }

  private async bindMemberPhoto(
    member: WorshipTeamMember,
    attachmentIds: string[] | undefined,
    actorId: string,
  ): Promise<string | null> {
    if (!attachmentIds?.length) return member.photoUrl;
    await this.uploads.attach(
      attachmentIds,
      AttachmentOwnerType.WORSHIP_TEAM_MEMBER,
      member.id,
      actorId,
    );
    const attachments = await this.uploads.findByOwner(
      AttachmentOwnerType.WORSHIP_TEAM_MEMBER,
      member.id,
    );
    const selected = attachmentIds.findLast((id) => {
      const attachment = attachments.find((item) => item.id === id);
      return attachment?.fileType?.startsWith('image/');
    });
    const photo = attachments.find((item) => item.id === selected);
    if (!photo) {
      throw new BadRequestException('선택한 팀원 이미지를 찾을 수 없습니다.');
    }
    return photo.fileUrl;
  }

  private async nextDisplayOrder(teamId: string): Promise<number> {
    const last = await this.memberRepository.findOne({
      where: { teamId },
      order: { displayOrder: 'DESC' },
    });
    return (last?.displayOrder ?? -1) + 1;
  }

  private sortMembers(members: WorshipTeamMember[]): WorshipTeamMember[] {
    return [...members].sort(
      (a, b) =>
        a.displayOrder - b.displayOrder || a.name.localeCompare(b.name, 'ko'),
    );
  }
}
