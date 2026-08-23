import type { Request } from 'express';
import { BadRequestException } from '@nestjs/common';
import type { DataSource, EntityManager, Repository } from 'typeorm';
import { AuditAction, BoardType, Post } from '../../entities';
import type { ActorInfo } from '../sermons/sermons.service';
import { PostsService } from './posts.service';

jest.mock('../../common/utils/sanitize.util', () => ({
  sanitizePlainText: (value: string) => value,
  sanitizeRichText: (value: string | undefined) => value,
}));

const actor: ActorInfo = { id: 'admin-id', loginId: 'admin' };
const request = {} as Request;

describe('PostsService consent removal', () => {
  it('creates a gallery post without a consent field', async () => {
    const saved = {
      id: 'post-id',
      boardType: BoardType.GALLERY,
      title: '여름 수련회',
      thumbnailUrl: '/photo.jpg',
    } as Post;
    const transaction = jest.fn().mockResolvedValue(saved);
    const record = jest.fn().mockResolvedValue(undefined);
    const service = new PostsService(
      {} as Repository<Post>,
      { transaction } as unknown as DataSource,
      {} as never,
      { record } as never,
    );

    await expect(
      service.create(
        {
          boardType: BoardType.GALLERY,
          title: saved.title,
          thumbnailUrl: saved.thumbnailUrl,
          startDate: '2024-07-20',
        },
        actor,
        request,
      ),
    ).resolves.toBe(saved);
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.POST_CREATE,
        detail: `[${BoardType.GALLERY}] ${saved.title}`,
      }),
    );
  });

  it('updates gallery attachments without a consent field', async () => {
    const post = {
      id: 'post-id',
      boardType: BoardType.GALLERY,
      title: '여름 수련회',
    } as Post;
    const transaction = jest.fn().mockResolvedValue(post);
    const record = jest.fn().mockResolvedValue(undefined);
    const service = new PostsService(
      {
        findOne: jest.fn().mockResolvedValue(post),
      } as unknown as Repository<Post>,
      { transaction } as unknown as DataSource,
      {} as never,
      { record } as never,
    );

    await expect(
      service.update(
        post.id,
        { attachmentIds: ['33333333-3333-4333-8333-333333333333'] },
        actor,
        request,
      ),
    ).resolves.toBe(post);
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.POST_UPDATE,
        detail: `[${BoardType.GALLERY}] ${post.title}`,
      }),
    );
  });

  it('stores an administrator-selected historical gallery date range', async () => {
    const managedRepository = {
      create: jest.fn(
        (value: Partial<Post>): Post => ({ id: 'post-id', ...value }) as Post,
      ),
      save: jest.fn((value: Post): Promise<Post> => Promise.resolve(value)),
    };
    const manager = {
      getRepository: jest.fn(() => managedRepository),
    } as unknown as EntityManager;
    const dataSource = {
      transaction: jest.fn(
        (callback: (value: EntityManager) => unknown): Promise<unknown> =>
          Promise.resolve(callback(manager)),
      ),
    };
    const uploads = {
      attach: jest.fn().mockResolvedValue(undefined),
    };
    const service = new PostsService(
      {} as Repository<Post>,
      dataSource as unknown as DataSource,
      uploads as never,
      { record: jest.fn().mockResolvedValue(undefined) } as never,
    );

    const created = await service.create(
      {
        boardType: BoardType.GALLERY,
        title: '지난 여름 수련회',
        thumbnailUrl: '/photo.jpg',
        startDate: '2024-07-20',
        endDate: '2024-07-22',
      },
      actor,
      request,
    );

    expect(created).toEqual(
      expect.objectContaining({
        startDate: '2024-07-20',
        endDate: '2024-07-22',
      }),
    );
    expect(managedRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        startDate: '2024-07-20',
        endDate: '2024-07-22',
      }),
    );
  });

  it('rejects a gallery end date before its selected start date', async () => {
    const transaction = jest.fn();
    const service = new PostsService(
      {} as Repository<Post>,
      { transaction } as unknown as DataSource,
      {} as never,
      {} as never,
    );

    await expect(
      service.create(
        {
          boardType: BoardType.GALLERY,
          title: '날짜 역전',
          startDate: '2024-07-22',
          endDate: '2024-07-20',
        },
        actor,
        request,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('requires a selected start date for new gallery posts', async () => {
    const transaction = jest.fn();
    const service = new PostsService(
      {} as Repository<Post>,
      { transaction } as unknown as DataSource,
      {} as never,
      {} as never,
    );

    await expect(
      service.create(
        {
          boardType: BoardType.GALLERY,
          title: '날짜 없음',
        },
        actor,
        request,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(transaction).not.toHaveBeenCalled();
  });
});
