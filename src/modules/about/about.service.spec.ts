import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import type { Request } from 'express';
import { AboutPage, AttachmentOwnerType, AuditAction } from '../../entities';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import type { ActorInfo } from '../sermons/sermons.service';
import { UploadsService } from '../uploads/uploads.service';
import { AboutService } from './about.service';

jest.mock('../../common/utils/sanitize.util', () => ({
  sanitizePlainText: (value: string | undefined) => value,
  sanitizeRichText: (value: string | undefined) => value,
}));

const actor: ActorInfo = { id: 'admin-id', loginId: 'admin' };
const request = {} as Request;
const leaderAttachmentId = '11111111-1111-4111-8111-111111111111';
const closingAttachmentId = '22222222-2222-4222-8222-222222222222';

describe('AboutService', () => {
  it('creates the singleton with the current public About content when no row exists', async () => {
    // Given
    const repository = {
      exists: jest.fn().mockResolvedValue(false),
      create: jest.fn().mockImplementation((value: AboutPage) => value),
      save: jest
        .fn()
        .mockImplementation((value: AboutPage) => Promise.resolve(value)),
    };
    const module = await Test.createTestingModule({
      providers: [
        AboutService,
        { provide: getRepositoryToken(AboutPage), useValue: repository },
        { provide: UploadsService, useValue: {} },
        { provide: AuditLogsService, useValue: {} },
      ],
    }).compile();
    const service = module.get(AboutService);

    // When
    await service.onModuleInit();

    // Then
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        introEyebrow: 'ABOUT US',
        introTitle: '혼자가 아니라 함께',
        leaderName: '박정인 목사',
        leaderRole: '청소년부 담당',
        leaderPhotoUrl: '/images/about/exact/leader-portrait.png',
        teamEyebrow: 'OUR TEAM',
        closingPhotoUrl: '/images/exact/about-closing-cal.png',
        closingPhotoLabel: '함께 드리는 예배',
        closingLines: ['예배는 우리의 고백이자,', '우리의 시작입니다.'],
        metaTitle: '소개',
      }),
    );
  });

  it('binds selected uploads, derives both photo URLs, and audits an admin update', async () => {
    // Given
    const page = Object.assign(new AboutPage(), {
      id: 'about-id',
      introEyebrow: 'ABOUT US',
      introTitle: '혼자가 아니라 함께',
      introBody: '소개',
      values: [],
      leaderEyebrow: 'OUR LEADER',
      leaderName: '박정인 목사',
      leaderRole: '청소년부 담당',
      leaderBody: '인사말',
      leaderPhotoUrl: null,
      teamEyebrow: 'OUR TEAM',
      closingPhotoUrl: null,
      closingPhotoLabel: '함께 드리는 예배',
      closingLines: ['첫째 줄', '둘째 줄'],
      closingLabel: 'J-TEEN WORSHIP',
      metaTitle: '소개',
      metaDescription: '소개 설명',
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    });
    const repository = {
      findOne: jest.fn().mockResolvedValue(page),
      save: jest
        .fn()
        .mockImplementation((value: AboutPage) => Promise.resolve(value)),
    };
    const uploads = {
      attach: jest.fn().mockResolvedValue(undefined),
      findByOwner: jest.fn().mockResolvedValue([
        {
          id: leaderAttachmentId,
          fileUrl: '/uploads/leader.jpg',
          fileType: 'image/jpeg',
        },
        {
          id: closingAttachmentId,
          fileUrl: '/uploads/closing.jpg',
          fileType: 'image/jpeg',
        },
      ]),
    };
    const auditLogs = { record: jest.fn().mockResolvedValue(undefined) };
    const module = await Test.createTestingModule({
      providers: [
        AboutService,
        { provide: getRepositoryToken(AboutPage), useValue: repository },
        { provide: UploadsService, useValue: uploads },
        { provide: AuditLogsService, useValue: auditLogs },
      ],
    }).compile();
    const service = module.get(AboutService);

    // When
    const saved = await service.update(
      {
        leaderName: '새 담당자',
        attachmentIds: [leaderAttachmentId, closingAttachmentId],
        leaderPhotoAttachmentId: leaderAttachmentId,
        closingPhotoAttachmentId: closingAttachmentId,
      },
      actor,
      request,
    );

    // Then
    expect(uploads.attach).toHaveBeenCalledWith(
      [leaderAttachmentId, closingAttachmentId],
      AttachmentOwnerType.ABOUT_PAGE,
      page.id,
      actor.id,
    );
    expect(saved).toEqual(
      expect.objectContaining({
        leaderName: '새 담당자',
        leaderPhotoUrl: '/uploads/leader.jpg',
        closingPhotoUrl: '/uploads/closing.jpg',
      }),
    );
    expect(auditLogs.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.ABOUT_UPDATE,
        targetType: 'about_page',
        targetId: page.id,
      }),
    );
  });
});
