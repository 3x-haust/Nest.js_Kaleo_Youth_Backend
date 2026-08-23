import { BadRequestException } from '@nestjs/common';

jest.mock('../../common/utils/sanitize.util', () => ({
  sanitizePlainText: (value: string | undefined) => value,
  sanitizeRichText: (value: string | undefined) => value,
}));

import { EventsService } from './events.service';

describe('EventsService create date validation', () => {
  afterEach(() => jest.useRealTimers());

  it('rejects a start date before the current Asia/Seoul calendar date', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-22T15:30:00.000Z'));
    const dataSource = { transaction: jest.fn() };
    const service = new EventsService(
      {} as never,
      dataSource as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.create(
        { title: 'Past event', startDate: '2026-08-22' },
        { id: 'admin-id', loginId: 'admin' },
        {} as never,
      ),
    ).rejects.toThrow(BadRequestException);
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('allows the current Asia/Seoul calendar date and preserves end >= start', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-22T15:30:00.000Z'));
    const repository = {
      create: jest.fn((event: object) => ({ id: 'event-id', ...event })),
      save: jest.fn((event: object) => event),
    };
    const dataSource = {
      transaction: jest.fn((callback: (manager: object) => unknown) =>
        callback({ getRepository: () => repository }),
      ),
    };
    const auditLogs = { record: jest.fn() };
    const uploads = { attach: jest.fn() };
    const service = new EventsService(
      {} as never,
      dataSource as never,
      auditLogs as never,
      uploads as never,
    );

    await expect(
      service.create(
        {
          title: 'Today event',
          startDate: '2026-08-23',
          endDate: '2026-08-23',
        },
        { id: 'admin-id', loginId: 'admin' },
        {} as never,
      ),
    ).resolves.toMatchObject({ startDate: '2026-08-23' });
  });
});
