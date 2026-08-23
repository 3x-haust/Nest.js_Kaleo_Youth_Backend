import {
  AttachmentOwnerType,
  type Attachment,
  type Setlist,
} from '../../entities';
import { UploadsService } from '../uploads/uploads.service';
import { SetlistsController } from './setlists.controller';
import { SetlistsService } from './setlists.service';

jest.mock('../../common/utils/sanitize.util', () => ({
  sanitizePlainText: (value: string) => value,
}));

describe('SetlistsController', () => {
  it('returns setlist attachments in upload display order', async () => {
    const setlist = {
      id: 'setlist-id',
      songs: [],
    } as unknown as Setlist;
    const attachments = [
      { id: 'attachment-1', displayOrder: 0 },
      { id: 'attachment-2', displayOrder: 1 },
    ] as Attachment[];
    const setlistsService = {
      findOne: jest.fn().mockResolvedValue(setlist),
    };
    const uploads = {
      findByOwner: jest.fn().mockResolvedValue(attachments),
    };
    const controller = new SetlistsController(
      setlistsService as unknown as SetlistsService,
      uploads as unknown as UploadsService,
    );

    const result = await controller.findOne('setlist-id');

    expect(uploads.findByOwner).toHaveBeenCalledWith(
      AttachmentOwnerType.SETLIST,
      'setlist-id',
    );
    expect(result.attachments).toEqual(attachments);
  });
});
