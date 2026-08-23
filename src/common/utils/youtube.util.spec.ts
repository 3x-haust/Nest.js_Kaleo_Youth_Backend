import { guessSongFromVideoTitle } from './youtube.util';

describe('guessSongFromVideoTitle', () => {
  it('prefers the Korean title from a bilingual worship upload', () => {
    expect(
      guessSongFromVideoTitle(
        '내 삶은 주의 것 (피아버전) / MY LIFE BELONGS TO THE LORD (FIA.ver) - 피아워십',
      ),
    ).toEqual({
      songTitle: '내 삶은 주의 것',
      artist: '피아워십',
    });
  });

  it('keeps a Korean leading title and drops the translated suffix', () => {
    expect(
      guessSongFromVideoTitle(
        '주와 함께 걸어가네 (Live) Walking With The Lord',
      ),
    ).toEqual({
      songTitle: '주와 함께 걸어가네',
      artist: null,
    });
  });

  it('preserves a title that is genuinely non-Korean', () => {
    expect(guessSongFromVideoTitle('Tetap Setia (Live)')).toEqual({
      songTitle: 'Tetap Setia',
      artist: null,
    });
  });

  it('preserves the conventional artist-first separator format', () => {
    expect(guessSongFromVideoTitle('WELOVE - 시간을 뚫고')).toEqual({
      songTitle: '시간을 뚫고',
      artist: 'WELOVE',
    });
  });
});
