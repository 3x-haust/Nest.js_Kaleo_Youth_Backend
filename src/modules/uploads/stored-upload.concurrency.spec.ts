import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import decodeHeic from 'heic-decode';
import { encodeImageAsWebp } from './stored-upload';

jest.mock('heic-decode');

const mockedDecodeHeic = jest.mocked(decodeHeic);

describe('HEIC encoding memory bound', () => {
  it('never decodes more than one HEIC image at once', async () => {
    const uploadDir = await mkdtemp(join(tmpdir(), 'kaleo-heic-memory-'));
    const firstInput = join(uploadDir, 'first.heic');
    const secondInput = join(uploadDir, 'second.heic');
    await Promise.all([
      writeFile(firstInput, Buffer.from('first')),
      writeFile(secondInput, Buffer.from('second')),
    ]);

    let activeDecodes = 0;
    let maximumDecodes = 0;
    mockedDecodeHeic.mockImplementation(async () => {
      activeDecodes += 1;
      maximumDecodes = Math.max(maximumDecodes, activeDecodes);
      await new Promise<void>((resolve) => {
        setImmediate(resolve);
      });
      activeDecodes -= 1;
      return {
        width: 1,
        height: 1,
        data: new Uint8ClampedArray([0, 0, 0, 255]),
      };
    });

    try {
      await Promise.all([
        encodeImageAsWebp(
          firstInput,
          join(uploadDir, 'first.webp'),
          'image/heic',
        ),
        encodeImageAsWebp(
          secondInput,
          join(uploadDir, 'second.webp'),
          'image/heic',
        ),
      ]);

      expect(maximumDecodes).toBe(1);
    } finally {
      await rm(uploadDir, { recursive: true, force: true });
    }
  });
});
