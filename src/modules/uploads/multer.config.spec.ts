import { buildMulterOptions } from './multer.config';

describe('buildMulterOptions', () => {
  it.each([
    ['photo.heic', 'image/heic'],
    ['photo.heic', 'image/heic-sequence'],
    ['photo.heif', 'image/heif'],
    ['photo.heif', 'image/heif-sequence'],
  ])('accepts %s with %s', (originalname, mimetype) => {
    const options = buildMulterOptions('./uploads');
    const callback = jest.fn();

    options.fileFilter?.(
      {},
      { originalname, mimetype } as Express.Multer.File,
      callback,
    );

    expect(callback).toHaveBeenCalledWith(null, true);
  });

  it('does not apply application-level file count or byte limits', () => {
    const options = buildMulterOptions('./uploads');

    expect(options.limits).toBeUndefined();
  });
});
