import { buildMulterOptions } from './multer.config';

describe('buildMulterOptions', () => {
  it('does not apply application-level file count or byte limits', () => {
    const options = buildMulterOptions('./uploads');

    expect(options.limits).toBeUndefined();
  });
});
