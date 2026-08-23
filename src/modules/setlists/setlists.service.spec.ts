import type { Repository } from 'typeorm';
import type { Setlist, SetlistSong } from '../../entities';
import { SetlistsService } from './setlists.service';

jest.mock('../../common/utils/sanitize.util', () => ({
  sanitizePlainText: (value: string) => value,
}));

describe('SetlistsService', () => {
  it('uses a deterministic id tie-breaker for latest setlists', async () => {
    const find = jest.fn().mockResolvedValue([]);
    const service = new SetlistsService(
      { find } as unknown as Repository<Setlist>,
      {} as Repository<SetlistSong>,
      null as never,
      null as never,
      null as never,
      null as never,
    );

    await service.findLatest();

    expect(find).toHaveBeenCalledWith({
      relations: { songs: true },
      order: { serviceDate: 'DESC', id: 'ASC' },
      take: 3,
    });
  });
});
