import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import type { Request } from 'express';
import {
  AttachmentOwnerType,
  WorshipTeam,
  WorshipTeamMember,
} from '../../entities';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import type { ActorInfo } from '../sermons/sermons.service';
import { UploadsService } from '../uploads/uploads.service';
import { WorshipTeamService } from './worship-team.service';

jest.mock('../../common/utils/sanitize.util', () => ({
  sanitizePlainText: (value: string | undefined) => value,
  sanitizeRichText: (value: string | undefined) => value,
}));

const actor: ActorInfo = { id: 'admin-id', loginId: 'admin' };
const request = {} as Request;
const attachmentId = '11111111-1111-4111-8111-111111111111';

describe('WorshipTeamService member media', () => {
  it('persists bio and derives the created member photo from its uploaded attachment', async () => {
    // Given
    const team = Object.assign(new WorshipTeam(), {
      id: 'team-id',
      members: [],
    });
    const member = Object.assign(new WorshipTeamMember(), {
      id: 'member-id',
      teamId: team.id,
      name: '김주원',
      part: '기타',
      bio: '예배의 선율을 채워갑니다.',
      photoUrl: null,
      displayOrder: 0,
    });
    const teamRepository = {
      findOne: jest.fn().mockResolvedValue(team),
    };
    const memberRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockReturnValue(member),
      save: jest.fn().mockResolvedValue(member),
    };
    const uploads = {
      attach: jest.fn().mockResolvedValue(undefined),
      findByOwner: jest.fn().mockResolvedValue([
        {
          id: attachmentId,
          fileUrl: '/uploads/member.jpg',
          fileType: 'image/jpeg',
        },
      ]),
    };
    const module = await Test.createTestingModule({
      providers: [
        WorshipTeamService,
        { provide: getRepositoryToken(WorshipTeam), useValue: teamRepository },
        {
          provide: getRepositoryToken(WorshipTeamMember),
          useValue: memberRepository,
        },
        {
          provide: AuditLogsService,
          useValue: { record: jest.fn().mockResolvedValue(undefined) },
        },
        { provide: UploadsService, useValue: uploads },
      ],
    }).compile();
    const service = module.get(WorshipTeamService);

    // When
    const saved = await service.addMember(
      team.id,
      {
        name: member.name,
        part: member.part ?? undefined,
        bio: member.bio ?? undefined,
        displayOrder: 0,
        attachmentIds: [attachmentId],
      },
      actor,
      request,
    );

    // Then
    expect(memberRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ bio: member.bio }),
    );
    expect(uploads.attach).toHaveBeenCalledWith(
      [attachmentId],
      AttachmentOwnerType.WORSHIP_TEAM_MEMBER,
      member.id,
      actor.id,
    );
    expect(saved.photoUrl).toBe('/uploads/member.jpg');
  });

  it('persists an updated bio and replaces the photo from the selected upload', async () => {
    // Given
    const member = Object.assign(new WorshipTeamMember(), {
      id: 'member-id',
      name: '김주원',
      bio: '이전 소개',
      photoUrl: '/uploads/old.jpg',
      displayOrder: 0,
    });
    const memberRepository = {
      findOne: jest.fn().mockResolvedValue(member),
      save: jest
        .fn()
        .mockImplementation((value: WorshipTeamMember) =>
          Promise.resolve(value),
        ),
    };
    const uploads = {
      attach: jest.fn().mockResolvedValue(undefined),
      findByOwner: jest.fn().mockResolvedValue([
        {
          id: attachmentId,
          fileUrl: '/uploads/new.jpg',
          fileType: 'image/jpeg',
        },
      ]),
    };
    const module = await Test.createTestingModule({
      providers: [
        WorshipTeamService,
        { provide: getRepositoryToken(WorshipTeam), useValue: {} },
        {
          provide: getRepositoryToken(WorshipTeamMember),
          useValue: memberRepository,
        },
        {
          provide: AuditLogsService,
          useValue: { record: jest.fn().mockResolvedValue(undefined) },
        },
        { provide: UploadsService, useValue: uploads },
      ],
    }).compile();
    const service = module.get(WorshipTeamService);

    // When
    const saved = await service.updateMember(
      member.id,
      { bio: '새 소개', attachmentIds: [attachmentId] },
      actor,
      request,
    );

    // Then
    expect(uploads.attach).toHaveBeenCalledWith(
      [attachmentId],
      AttachmentOwnerType.WORSHIP_TEAM_MEMBER,
      member.id,
      actor.id,
    );
    expect(saved.bio).toBe('새 소개');
    expect(saved.photoUrl).toBe('/uploads/new.jpg');
  });
});
