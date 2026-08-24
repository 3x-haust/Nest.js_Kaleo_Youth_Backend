import { ConfigService } from '@nestjs/config';
import type { DataSource, EntityManager } from 'typeorm';
import { Sermon } from '../../entities';
import {
  YoutubeChannelService,
  type YoutubeChannelUpload,
} from '../youtube/youtube-channel.service';
import { SermonYoutubeSyncService } from './sermon-youtube-sync.service';

jest.mock('../../common/utils/sanitize.util', () => ({
  sanitizePlainText: (value: string) => value,
}));

const CHANNEL = '@kaleo-youth';

function upload(
  youtubeVideoId: string,
  publishedAt: string,
  title = `2026. 8. 23. 박정인 목사. 잠 31:16-20. Title ${youtubeVideoId}`,
): YoutubeChannelUpload {
  return {
    youtubeVideoId,
    title,
    publishedAt,
    thumbnailUrl: null,
  };
}

function createHarness(remoteUploads: YoutubeChannelUpload[] = []) {
  const sermons: Sermon[] = [];
  let nextId = 1;
  const sermonRepository = {
    find: jest.fn(() => Promise.resolve([...sermons])),
    create: jest.fn((value: Partial<Sermon>) => value as Sermon),
    save: jest.fn((values: Sermon[]) => {
      const saved = values.map((value) => ({
        ...value,
        id: value.id ?? `sermon-${nextId++}`,
      })) as Sermon[];
      sermons.push(...saved);
      return Promise.resolve(saved);
    }),
  };
  const manager = {
    query: jest.fn().mockResolvedValue(undefined),
    getRepository: jest.fn(() => sermonRepository),
  };
  const dataSource = {
    transaction: jest.fn((callback: (manager: EntityManager) => unknown) =>
      Promise.resolve(callback(manager as unknown as EntityManager)),
    ),
  };
  const youtube = {
    isEnabled: jest.fn().mockReturnValue(true),
    getLatestChannelUploads: jest.fn().mockResolvedValue(remoteUploads),
  };
  const config = {
    get: jest.fn((key: string) => {
      if (key === 'youtube.sermonChannel') return CHANNEL;
      if (key === 'youtube.sermonPreacherName') return '박정인 목사';
      return undefined;
    }),
  };
  const service = new SermonYoutubeSyncService(
    dataSource as unknown as DataSource,
    youtube as unknown as YoutubeChannelService,
    config as unknown as ConfigService,
  );

  return {
    service,
    sermons,
    sermonRepository,
    manager,
    dataSource,
    youtube,
    config,
  };
}

describe('SermonYoutubeSyncService', () => {
  it('returns disabled without external or database work when channel config is empty', async () => {
    const harness = createHarness();
    harness.config.get.mockImplementation((key: string) =>
      key === 'youtube.sermonChannel' ? '  ' : undefined,
    );

    await expect(harness.service.sync()).resolves.toEqual({
      status: 'disabled',
    });
    expect(harness.youtube.getLatestChannelUploads).not.toHaveBeenCalled();
    expect(harness.dataSource.transaction).not.toHaveBeenCalled();
  });

  it('maps a structured YouTube title to sermon metadata', async () => {
    const harness = createHarness([
      upload(
        'structured-video',
        '2026-08-22T15:30:00.000Z',
        '2026. 8. 23. 박정인 목사. 잠 31:16-20. 세는 손, 펴는 손',
      ),
    ]);

    await harness.service.sync();

    expect(harness.sermonRepository.create).toHaveBeenCalledWith({
      title: '세는 손, 펴는 손',
      publishedAt: '2026-08-23',
      youtubeVideoId: 'structured-video',
      preacherName: '박정인 목사',
      summary: null,
      bibleReference: '잠 31:16-20',
      createdByAdminId: null,
    });
  });

  it('trims every field in a structured YouTube title', async () => {
    const harness = createHarness([
      upload(
        'trimmed-video',
        '2026-08-20T01:00:00.000Z',
        ' 2026. 8. 23.   박정인 목사  .   잠 31:16-20  .   세는 손, 펴는 손  ',
      ),
    ]);

    await harness.service.sync();

    expect(harness.sermons[0]).toEqual(
      expect.objectContaining({
        title: '세는 손, 펴는 손',
        publishedAt: '2026-08-23',
        preacherName: '박정인 목사',
        bibleReference: '잠 31:16-20',
      }),
    );
  });

  it.each([
    ['plain upload title', '청소년부 여름수련회 후기영상'],
    ['missing sermon title segment', '2026. 8. 23. 박정인 목사. 잠 31:16-20'],
  ])('ignores %s', async (_caseName, youtubeTitle) => {
    const harness = createHarness([
      upload('malformed-video', '2026-08-22T15:30:00.000Z', youtubeTitle),
    ]);

    await expect(harness.service.sync()).resolves.toEqual({
      status: 'unchanged',
    });
    expect(harness.dataSource.transaction).not.toHaveBeenCalled();
    expect(harness.sermonRepository.save).not.toHaveBeenCalled();
  });

  it('ignores a structured title with an invalid calendar date', async () => {
    const youtubeTitle =
      '2026. 2. 29. 다른 설교자. 요 3:16. 구조화되지 않아야 하는 제목';
    const harness = createHarness([
      upload('invalid-date-video', '2026-08-22T15:30:00.000Z', youtubeTitle),
    ]);

    await expect(harness.service.sync()).resolves.toEqual({
      status: 'unchanged',
    });
    expect(harness.dataSource.transaction).not.toHaveBeenCalled();
  });

  it('ignores a structured title whose field exceeds its entity ceiling', async () => {
    const youtubeTitle = `2026. 8. 23. ${'가'.repeat(51)}. 잠 31:16-20. 설교 제목`;
    const harness = createHarness([
      upload('oversized-field-video', '2026-08-22T15:30:00.000Z', youtubeTitle),
    ]);

    await expect(harness.service.sync()).resolves.toEqual({
      status: 'unchanged',
    });
    expect(harness.dataSource.transaction).not.toHaveBeenCalled();
  });

  it('ignores an unstructured title regardless of upload timestamp', async () => {
    const harness = createHarness([
      upload('kst-video', '2026-08-22T15:30:00.000Z', '한국어 설교 제목'),
    ]);

    await expect(harness.service.sync()).resolves.toEqual({
      status: 'unchanged',
    });
    expect(harness.dataSource.transaction).not.toHaveBeenCalled();
  });

  it('creates every unseen upload oldest-to-newest under an advisory lock', async () => {
    const harness = createHarness([
      upload('newest', '2026-08-24T01:00:00.000Z'),
      upload('oldest', '2026-08-22T01:00:00.000Z'),
      upload('middle', '2026-08-23T01:00:00.000Z'),
    ]);
    harness.sermons.push(
      upload('middle', '2026-08-23T01:00:00.000Z') as unknown as Sermon,
    );

    await expect(harness.service.sync()).resolves.toEqual({
      status: 'created',
      count: 2,
      youtubeVideoIds: ['oldest', 'newest'],
    });
    expect(harness.youtube.getLatestChannelUploads).toHaveBeenCalledWith(
      CHANNEL,
      50,
    );
    expect(harness.manager.query).toHaveBeenCalledWith(
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      ['sermon-youtube-sync'],
    );
    expect(
      harness.sermonRepository.create.mock.calls.map(
        ([value]: [Partial<Sermon>]) => value.youtubeVideoId,
      ),
    ).toEqual(['oldest', 'newest']);
  });

  it('is idempotent when the same uploads are synced repeatedly', async () => {
    const harness = createHarness([
      upload('first', '2026-08-22T01:00:00.000Z'),
      upload('second', '2026-08-23T01:00:00.000Z'),
    ]);

    await expect(harness.service.sync()).resolves.toEqual(
      expect.objectContaining({ status: 'created', count: 2 }),
    );
    await expect(harness.service.sync()).resolves.toEqual({
      status: 'unchanged',
    });
    expect(harness.sermons).toHaveLength(2);
    expect(harness.sermonRepository.save).toHaveBeenCalledTimes(1);
  });

  it('returns a typed external failure and performs no writes', async () => {
    const harness = createHarness();
    harness.youtube.getLatestChannelUploads.mockRejectedValue(
      new Error('YouTube unavailable'),
    );

    await expect(harness.service.sync()).resolves.toEqual({
      status: 'failed',
      reason: 'youtube_error',
    });
    expect(harness.dataSource.transaction).not.toHaveBeenCalled();
    expect(harness.sermonRepository.save).not.toHaveBeenCalled();
  });
});
