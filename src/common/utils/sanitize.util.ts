import sanitizeHtml from 'sanitize-html';

/**
 * 관리자만 글을 쓸 수 있는 구조지만, 관리자 계정이 탈취됐을 때를 대비한 방어적 조치로
 * 저장 시점에 한 번 새니타이징합니다 (Stored XSS 방지).
 */
const RICH_TEXT_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    'p',
    'br',
    'strong',
    'b',
    'em',
    'i',
    'u',
    's',
    'blockquote',
    'ul',
    'ol',
    'li',
    'h2',
    'h3',
    'h4',
    'a',
    'img',
    'hr',
    'figure',
    'figcaption',
    'span',
  ],
  allowedAttributes: {
    a: ['href', 'title', 'target', 'rel'],
    img: ['src', 'alt', 'title', 'width', 'height'],
    span: ['class'],
    '*': ['class'],
  },
  // javascript:, data: 같은 스킴을 통한 스크립트 실행을 차단합니다.
  allowedSchemes: ['http', 'https', 'mailto'],
  allowedSchemesByTag: { img: ['http', 'https'] },
  disallowedTagsMode: 'discard',
  transformTags: {
    // 외부 링크는 항상 opener 유출 없이 새 창으로 열리게 강제합니다.
    a: (tagName, attribs) => ({
      tagName,
      attribs: { ...attribs, rel: 'noopener noreferrer' },
    }),
  },
};

/** 본문 등 서식이 필요한 필드용 */
export function sanitizeRichText(
  input: string | null | undefined,
): string | null {
  if (input === null || input === undefined) return null;
  const cleaned = sanitizeHtml(input, RICH_TEXT_OPTIONS).trim();
  return cleaned.length > 0 ? cleaned : null;
}

/**
 * 제목·이름처럼 서식이 필요 없는 필드용. 태그를 전부 제거합니다.
 * 유튜브에서 받아온 영상 제목(제3자 작성 문자열)도 반드시 이 함수를 거칩니다.
 */
export function sanitizePlainText(
  input: string | null | undefined,
): string | null {
  if (input === null || input === undefined) return null;
  const cleaned = sanitizeHtml(input, {
    allowedTags: [],
    allowedAttributes: {},
  })
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.length > 0 ? cleaned : null;
}
