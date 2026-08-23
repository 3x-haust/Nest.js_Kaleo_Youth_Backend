import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Request } from 'express';
import { Repository } from 'typeorm';
import {
  sanitizePlainText,
  sanitizeRichText,
} from '../../common/utils/sanitize.util';
import {
  ABOUT_PAGE_ID,
  AboutPage,
  type Attachment,
  AttachmentOwnerType,
  AuditAction,
} from '../../entities';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import type { ActorInfo } from '../sermons/sermons.service';
import { UploadsService } from '../uploads/uploads.service';
import type { UpdateAboutDto } from './dto/about.dto';

const DEFAULT_ABOUT_PAGE: Omit<AboutPage, 'createdAt' | 'updatedAt'> = {
  id: ABOUT_PAGE_ID,
  introEyebrow: 'ABOUT US',
  introTitle: '혼자가 아니라 함께',
  introBody:
    '칼레오는 함께 예배하고, 서로를 격려하며 하나님 안에서 성장해가는 청소년 공동체입니다.',
  values: [
    {
      icon: 'cross',
      label: 'WORSHIP',
      title: '하나님을 예배합니다',
      body: '우리의 삶과 마음을 다해 하나님께 예배합니다.',
    },
    {
      icon: 'bible',
      label: 'GROW',
      title: '말씀 안에서 성장합니다.',
      body: '말씀을 배우고 서로를 격려하며 함께 성장합니다.',
    },
    {
      icon: 'people',
      label: 'TOGETHER',
      title: '서로를 사랑하고 함께합니다.',
      body: '혼자가 아니라 한 공동체로 기쁨과 아픔을 나눕니다.',
    },
  ],
  leaderEyebrow: 'OUR LEADER',
  leaderName: '박정인 목사',
  leaderRole: '청소년부 담당',
  leaderBody:
    '청소년들이 하나님을 인격적으로 만나고,\n서로를 사랑하며 믿음 안에서 자라가길 소망합니다.\nJ-TEEN이 예배와 공동체를 통해 더 깊은 믿음으로 나아가도록\n항상 기도하며 함께하겠습니다.',
  leaderPhotoUrl: '/images/about/exact/leader-portrait.png',
  teamEyebrow: 'OUR TEAM',
  closingPhotoUrl: '/images/exact/about-closing-cal.png',
  closingPhotoLabel: '함께 드리는 예배',
  closingLines: ['예배는 우리의 고백이자,', '우리의 시작입니다.'],
  closingLabel: 'J-TEEN WORSHIP',
  metaTitle: '소개',
  metaDescription:
    '함께 예배하고 성장하는 KALEO YOUTH와 J-TEEN 공동체를 소개합니다.',
};

@Injectable()
export class AboutService implements OnModuleInit {
  constructor(
    @InjectRepository(AboutPage)
    private readonly repository: Repository<AboutPage>,
    private readonly uploads: UploadsService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  async onModuleInit(): Promise<void> {
    const exists = await this.repository.exists({
      where: { id: ABOUT_PAGE_ID },
    });
    if (exists) return;
    await this.repository.save(this.repository.create(DEFAULT_ABOUT_PAGE));
  }

  async find(): Promise<AboutPage> {
    const page = await this.repository.findOne({
      where: { id: ABOUT_PAGE_ID },
    });
    if (!page) throw new NotFoundException('소개 페이지 정보가 없습니다.');
    return page;
  }

  async update(
    dto: UpdateAboutDto,
    actor: ActorInfo,
    request: Request,
  ): Promise<AboutPage> {
    const page = await this.find();

    if (dto.introEyebrow !== undefined)
      page.introEyebrow = this.requiredText(
        dto.introEyebrow,
        page.introEyebrow,
      );
    if (dto.introTitle !== undefined)
      page.introTitle = this.requiredText(dto.introTitle, page.introTitle);
    if (dto.introBody !== undefined)
      page.introBody = this.requiredText(dto.introBody, page.introBody);
    if (dto.values !== undefined)
      page.values = dto.values.map((value) => ({
        icon: value.icon,
        label: this.requiredText(value.label, value.label),
        title: this.requiredText(value.title, value.title),
        body: this.requiredText(value.body, value.body),
      }));
    if (dto.leaderEyebrow !== undefined)
      page.leaderEyebrow = this.requiredText(
        dto.leaderEyebrow,
        page.leaderEyebrow,
      );
    if (dto.leaderName !== undefined)
      page.leaderName = this.requiredText(dto.leaderName, page.leaderName);
    if (dto.leaderRole !== undefined)
      page.leaderRole = this.requiredText(dto.leaderRole, page.leaderRole);
    if (dto.leaderBody !== undefined)
      page.leaderBody = sanitizeRichText(dto.leaderBody) ?? page.leaderBody;
    if (dto.teamEyebrow !== undefined)
      page.teamEyebrow = this.requiredText(dto.teamEyebrow, page.teamEyebrow);
    if (dto.closingPhotoLabel !== undefined)
      page.closingPhotoLabel = this.requiredText(
        dto.closingPhotoLabel,
        page.closingPhotoLabel,
      );
    if (dto.closingLines !== undefined)
      page.closingLines = dto.closingLines.map((line) =>
        this.requiredText(line, line),
      );
    if (dto.closingLabel !== undefined)
      page.closingLabel = this.requiredText(
        dto.closingLabel,
        page.closingLabel,
      );
    if (dto.metaTitle !== undefined)
      page.metaTitle = this.requiredText(dto.metaTitle, page.metaTitle);
    if (dto.metaDescription !== undefined)
      page.metaDescription = this.requiredText(
        dto.metaDescription,
        page.metaDescription,
      );

    await this.repository.save(page);
    await this.uploads.attach(
      dto.attachmentIds,
      AttachmentOwnerType.ABOUT_PAGE,
      page.id,
      actor.id,
    );
    await this.applyPhotoSelection(page, dto);
    const saved = await this.repository.save(page);

    await this.auditLogs.record({
      action: AuditAction.ABOUT_UPDATE,
      adminId: actor.id,
      adminLoginId: actor.loginId,
      targetType: 'about_page',
      targetId: saved.id,
      detail: saved.metaTitle,
      request,
    });
    return saved;
  }

  private requiredText(value: string, fallback: string): string {
    return sanitizePlainText(value) ?? fallback;
  }

  private async applyPhotoSelection(
    page: AboutPage,
    dto: UpdateAboutDto,
  ): Promise<void> {
    const changesMedia =
      dto.attachmentIds !== undefined ||
      dto.leaderPhotoAttachmentId !== undefined ||
      dto.closingPhotoAttachmentId !== undefined;
    if (!changesMedia) return;

    const attachments = await this.uploads.findByOwner(
      AttachmentOwnerType.ABOUT_PAGE,
      page.id,
    );
    page.leaderPhotoUrl = this.selectedPhotoUrl(
      attachments,
      dto.leaderPhotoAttachmentId,
      page.leaderPhotoUrl,
    );
    page.closingPhotoUrl = this.selectedPhotoUrl(
      attachments,
      dto.closingPhotoAttachmentId,
      page.closingPhotoUrl,
    );
  }

  private selectedPhotoUrl(
    attachments: readonly Attachment[],
    attachmentId: string | undefined,
    currentUrl: string | null,
  ): string | null {
    if (attachmentId !== undefined) {
      const selected = attachments.find((item) => item.id === attachmentId);
      if (!selected?.fileType?.startsWith('image/')) {
        throw new BadRequestException(
          '선택한 소개 페이지 이미지를 찾을 수 없습니다.',
        );
      }
      return selected.fileUrl;
    }
    return currentUrl;
  }
}
