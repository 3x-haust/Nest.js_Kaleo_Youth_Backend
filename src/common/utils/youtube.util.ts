/**
 * 유튜브 관련 문자열 파싱 유틸.
 *
 * 보안 원칙: 사용자가 넣은 URL을 서버가 그대로 fetch 하지 않습니다(SSRF 방지).
 * URL에서 "ID처럼 생긴 부분"만 정규식으로 뽑아내고, 실제 요청 URL은
 * 서버가 googleapis.com 도메인으로 직접 조립합니다.
 */

/** 유튜브 영상 ID는 11자 고정이지만 여유를 둡니다. */
const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
/** 플레이리스트 ID */
const PLAYLIST_ID_PATTERN = /^[A-Za-z0-9_-]{10,64}$/;

/**
 * 영상 URL 또는 ID에서 영상 ID만 추출합니다.
 * 지원: watch?v=, youtu.be/, /embed/, /shorts/, 순수 ID
 */
export function extractYoutubeVideoId(
  input: string | null | undefined,
): string | null {
  if (!input) return null;
  const raw = input.trim();
  if (raw.length === 0) return null;

  if (VIDEO_ID_PATTERN.test(raw)) return raw;

  const patterns = [
    /[?&]v=([A-Za-z0-9_-]{11})/,
    /youtu\.be\/([A-Za-z0-9_-]{11})/,
    /\/embed\/([A-Za-z0-9_-]{11})/,
    /\/shorts\/([A-Za-z0-9_-]{11})/,
    /\/live\/([A-Za-z0-9_-]{11})/,
  ];
  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (match) return match[1];
  }
  return null;
}

/**
 * 플레이리스트 URL 또는 ID에서 list 값만 추출합니다.
 * si= 같은 추적 파라미터는 여기서 자연히 버려집니다.
 */
export function extractYoutubePlaylistId(
  input: string | null | undefined,
): string | null {
  if (!input) return null;
  const raw = input.trim();
  if (raw.length === 0) return null;

  if (PLAYLIST_ID_PATTERN.test(raw) && !raw.includes('/')) return raw;

  const match = raw.match(/[?&]list=([A-Za-z0-9_-]{10,64})/);
  if (match && PLAYLIST_ID_PATTERN.test(match[1])) return match[1];
  return null;
}

/**
 * 유튜브 영상 제목에서 곡명/아티스트를 추정합니다.
 * 실패해도 문제가 없도록 원본 제목을 곡명으로 되돌려 줍니다.
 * (원본은 setlist_songs.youtube_video_title 에 그대로 보관됩니다.)
 */
export function guessSongFromVideoTitle(videoTitle: string): {
  songTitle: string;
  artist: string | null;
} {
  let working = videoTitle.trim();

  // [라이브], (Official Video) 같은 부가 표기를 제거합니다.
  working = working
    .replace(
      /\s*[[(【][^\])】]*(?:official|lyric|live|mv|audio|video|version|ver\.?|4k|hd)[^\])】]*[\])】]/gi,
      '',
    )
    .replace(
      /\s*[[(【](?:라이브|공식|가사|영상|커버|[^\])】]*버전)[^\])】]*[\])】]/g,
      '',
    )
    .trim();

  const separators = [' - ', ' – ', ' — ', ' | ', ' / '];
  for (const separator of separators) {
    const index = working.indexOf(separator);
    if (index > 0) {
      const left = working.slice(0, index).trim();
      const right = working.slice(index + separator.length).trim();
      if (left.length > 0 && right.length > 0) {
        if (
          separator !== ' / ' &&
          left.includes(' / ') &&
          /[가-힣]/.test(left)
        ) {
          return {
            songTitle: koreanLocalizedTitle(left),
            artist: right,
          };
        }
        // 통상 "아티스트 - 곡명" 순서로 올라옵니다.
        return {
          songTitle: koreanLocalizedTitle(right),
          artist: left,
        };
      }
    }
  }

  return {
    songTitle: koreanLocalizedTitle(working.length > 0 ? working : videoTitle),
    artist: null,
  };
}

function koreanLocalizedTitle(title: string): string {
  const parts = title.split(/\s*\/\s*/).filter((part) => part.length > 0);
  const localized =
    parts.find((part) => /[가-힣]/.test(part)) ?? parts[0] ?? title;
  const translatedSuffix = localized.match(
    /^(.+?[가-힣])\s+(?=(?:[A-Za-z][A-Za-z'’.:-]*\s*){2,}$)/,
  );
  return (translatedSuffix?.[1] ?? localized).trim();
}
