/**
 * 데모 시드 — 로컬 메인 DB(kaleo_youth)에 실제 렌더링용 콘텐츠를 넣습니다.
 *
 * - 멱등: 고정 UUID + ON CONFLICT DO NOTHING → 몇 번을 실행해도 중복되지 않습니다.
 * - 갤러리 썸네일은 Figma 디자인 사진 경로(/images/...)를 사용해
 *   프론트 toFileUrl이 그대로 통과시킵니다.
 * - 설교/행사/공지/콘티를 함께 넣어 모든 페이지가 빈 상태가 아닌
 *   실제 데이터로 렌더링되게 합니다.
 */
const { Client } = require('pg');
require('dotenv').config();

const config = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5433),
  user: process.env.DB_USERNAME || 'kaleo',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_DATABASE || 'kaleo_youth',
};

const UUID = {
  sermon: '11111111-1111-4111-8111-111111111111',
  gallery1: '33333333-3333-4333-8333-333333333361',
  gallery2: '33333333-3333-4333-8333-333333333362',
  gallery3: '33333333-3333-4333-8333-333333333363',
  gallery4: '33333333-3333-4333-8333-333333333364',
  notice1: '33333333-3333-4333-8333-333333333341',
  notice2: '33333333-3333-4333-8333-333333333342',
  event1: '22222222-2222-4222-8222-222222222231',
  event2: '22222222-2222-4222-8222-222222222232',
  event3: '22222222-2222-4222-8222-222222222233',
  event4: '22222222-2222-4222-8222-222222222234',
  setlist1: '44444444-4444-4444-8444-444444444441',
  setlist2: '44444444-4444-4444-8444-444444444442',
  song1a: '55555555-5555-4555-8555-555555555551',
  song1b: '55555555-5555-4555-8555-555555555552',
  song1c: '55555555-5555-4555-8555-555555555553',
  song2a: '55555555-5555-4555-8555-555555555554',
  song2b: '55555555-5555-4555-8555-555555555555',
  song2c: '55555555-5555-4555-8555-555555555556',
  song2d: '55555555-5555-4555-8555-555555555557',
  member1: '66666666-6666-4666-8666-666666666661',
  member2: '66666666-6666-4666-8666-666666666662',
  member3: '66666666-6666-4666-8666-666666666663',
  member4: '66666666-6666-4666-8666-666666666664',
  member5: '66666666-6666-4666-8666-666666666665',
  member6: '66666666-6666-4666-8666-666666666666',
  member7: '66666666-6666-4666-8666-666666666667',
};

const sermonIds = Array.from(
  { length: 9 },
  (_, index) =>
    `11111111-1111-4111-8111-${String(111111111111 + index).padStart(12, '0')}`,
);
const sermonThumbnails = [
  '/images/exact/image-102-1477-cal.png',
  '/images/exact/image-102-1467-cal.png',
  '/images/exact/image-102-1457-cal.png',
  '/images/exact/image-102-1444-cal.png',
  '/images/exact/image-102-1434-cal.png',
  '/images/exact/image-102-1424-cal.png',
  '/images/exact/image-102-1412-cal.png',
  '/images/exact/image-102-1401-cal.png',
  '/images/exact/image-105-4268-cal.png',
];
const sermonPosters = new Map([
  [sermonIds[0], '/images/sections/message-artwork.png'],
  [sermonIds[8], '/images/exact/container-98-3134-cal.png'],
]);
const sermonRecentThumbnails = new Map([
  [sermonIds[8], '/images/exact/image-110-5869-cal.png'],
  [sermonIds[7], '/images/exact/image-110-5879-cal.png'],
  [sermonIds[6], '/images/exact/image-110-5889-cal.png'],
]);
const galleryIds = Array.from(
  { length: 9 },
  (_, index) =>
    `33333333-3333-4333-8333-${String(333333333361 + index).padStart(12, '0')}`,
);

const galleryPosts = [
  ['청소년부 여름캠프', '함께 예배하고 교제한 여름캠프 현장입니다.', '/images/gallery/semantic/image-110-5637-background.png'],
  ['청소년부 여름캠프', '함께 예배하고 교제한 여름캠프 현장입니다.', '/images/gallery/semantic/image-110-5712-background.png'],
  ['청소년부 여름캠프', '함께 예배하고 교제한 여름캠프 현장입니다.', '/images/gallery/semantic/image-110-5719-background.png'],
  ['청소년부 여름캠프', '함께 예배하고 교제한 여름캠프 현장입니다.', '/images/gallery/semantic/image-110-5767-background.png'],
  ['청소년부 여름캠프', '함께 예배하고 교제한 여름캠프 현장입니다.', '/images/gallery/semantic/image-110-5773-background.png'],
  ['청소년부 여름캠프', '함께 예배하고 교제한 여름캠프 현장입니다.', '/images/gallery/semantic/image-110-5779-background.png'],
  ['청소년부 여름캠프', '함께 예배하고 교제한 여름캠프 현장입니다.', '/images/gallery/semantic/image-110-5787-background.png'],
  ['청소년부 여름캠프', '함께 예배하고 교제한 여름캠프 현장입니다.', '/images/gallery/semantic/image-110-5793-background.png'],
  ['청소년부 여름캠프', '함께 예배하고 교제한 여름캠프 현장입니다.', '/images/gallery/semantic/image-110-5799-background.png'],
];

const notices = [
  ['2026 여름 수련회 안내', '8월 14일(금)~16일(일) 여름 수련회가 있습니다. 준비물: 성경, 세면도구. 자세한 내용은 담당 교사에게 문의해 주세요.'],
  ['주일 예배 시간 안내', '주일 예배는 매주 오전 10시, 수도교회 소예배실에서 드립니다. 새 친구는 언제나 환영합니다.'],
];

const events = [
  ['주일 청소년 예배', '하나님께 예배하고 함께 말씀을 나누는 시간', '2030-06-16T11:00:00+09:00', null, '수도교회 본당', '성경, 필기도구', null, null],
  ['주일 청년 모임', '함께 교제하며 신앙을 나누는 시간', '2030-06-23T13:00:00+09:00', null, '수도교회 교육관', '성경, 필기도구', null, null],
  ['성경 공부 모임', '말씀을 깊이 있게 탐구하는 시간', '2030-06-25T19:30:00+09:00', null, '수도교회 소예배실', '성경, 필기도구', null, null],
  ['기도회', '함께 모여 교회의 기도 제목을 나누는 시간', '2030-06-28T20:00:00+09:00', null, '수도교회 기도실', '성경, 필기도구', null, null],
];

const setlists = [
  [UUID.setlist1, '2026-08-13', '주일예배 찬양 콘티', [
    [UUID.song1a, '찬양 1', 'J-TEEN', 'ScMzIvxBSi4', '/images/setlists/setlist-1.png'],
    [UUID.song1b, '찬양 2', 'J-TEEN', 'ScMzIvxBSi4', '/images/setlists/setlist-2.png'],
    [UUID.song1c, '찬양 3', 'J-TEEN', 'ScMzIvxBSi4', '/images/setlists/setlist-3.png'],
  ]],
  [UUID.setlist2, '2026-08-13', '주일예배 찬양 콘티', [
    [UUID.song2a, '찬양 1', 'J-TEEN', 'ScMzIvxBSi4', '/images/setlists/setlist-5.png'],
    [UUID.song2b, '찬양 2', 'J-TEEN', 'ScMzIvxBSi4', '/images/setlists/setlist-4.png'],
    [UUID.song2c, '찬양 3', 'J-TEEN', 'ScMzIvxBSi4', '/images/setlists/setlist-6.png'],
    [UUID.song2d, '찬양 4', 'J-TEEN', 'ScMzIvxBSi4', '/images/setlists/setlist-7.png'],
  ]],
];

const teamMembers = [
  [UUID.member1, '김주원', 'Electric Guitar', '묵묵히, 그러나 뜨겁게|예배의 선율을 채워갑니다.'],
  [UUID.member2, '김하원', 'DRUMS', '힘차게, 그리고 한마음으로|예배의 리듬을 세워갑니다.'],
  [UUID.member3, '유성아', 'MAIN KEYBOARD', '섬세하게, 때로는 강렬하게|예배의 공간을 만들어갑니다.'],
  [UUID.member4, '신현희', 'SECOND KEYBOARD', '조용히 곁을 지키며|예배의 깊이를 더합니다.'],
  [UUID.member5, '유성윤', 'BASS', '묵묵히, 그러나 뜨겁게|예배의 중심을 단단히 잡아갑니다.'],
  [UUID.member6, '문부열', 'VOCAL', '진심을 담은 한 목소리로|하나님을 찬양합니다.'],
  [UUID.member7, '정효윤', 'VOCAL', '기쁨으로 노래하고|마음으로 예배합니다.'],
];

async function main() {
  const client = new Client(config);
  await client.connect();
  try {
    for (const sermonId of sermonIds) {
      await client.query(
        `INSERT INTO sermons (id, title, preacher_name, bible_reference, youtube_video_id, summary, published_at, created_at, updated_at)
         VALUES ($1, '돈에 기대지 마십시오.', '성백영 담임목사', '잠언 10장 1-4절', 'ScMzIvxBSi4', '하나님을 신뢰하며 정직하고 성실하게 살아가는 지혜를 나눕니다.', '2026-07-26', now(), now())
         ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, preacher_name = EXCLUDED.preacher_name, bible_reference = EXCLUDED.bible_reference, youtube_video_id = EXCLUDED.youtube_video_id, summary = EXCLUDED.summary, published_at = EXCLUDED.published_at, updated_at = now()`,
        [sermonId],
      );
    }
    await client.query(
      `DELETE FROM attachments
       WHERE owner_type = 'sermon'
         AND owner_id = ANY($1::uuid[])
         AND uploaded_by_admin_id IS NULL`,
      [sermonIds],
    );
    for (let index = 0; index < sermonIds.length; index++) {
      const sermonId = sermonIds[index];
      await client.query(
        `INSERT INTO attachments (id, owner_type, owner_id, file_url, original_name, file_type, file_size, display_order, uploaded_by_admin_id, created_at)
         VALUES ($1, 'sermon', $2, $3, NULL, 'image/png', NULL, 0, NULL, now())
         ON CONFLICT (id) DO UPDATE SET owner_id = EXCLUDED.owner_id, file_url = EXCLUDED.file_url, file_type = EXCLUDED.file_type, display_order = EXCLUDED.display_order`,
        [
          `88888888-8888-4888-8888-${String(888888888881 + index).padStart(12, '0')}`,
          sermonId,
          sermonThumbnails[index],
        ],
      );
      const poster = sermonPosters.get(sermonId);
      if (poster) {
        await client.query(
          `INSERT INTO attachments (id, owner_type, owner_id, file_url, original_name, file_type, file_size, display_order, uploaded_by_admin_id, created_at)
           VALUES ($1, 'sermon', $2, $3, NULL, 'image/png', NULL, 1, NULL, now())
           ON CONFLICT (id) DO UPDATE SET owner_id = EXCLUDED.owner_id, file_url = EXCLUDED.file_url, file_type = EXCLUDED.file_type, display_order = EXCLUDED.display_order`,
          [
            `99999999-9999-4999-8999-${String(999999999991 + index).padStart(12, '0')}`,
            sermonId,
            poster,
          ],
        );
      }
      const recentThumbnail = sermonRecentThumbnails.get(sermonId);
      if (recentThumbnail) {
        await client.query(
          `INSERT INTO attachments (id, owner_type, owner_id, file_url, original_name, file_type, file_size, display_order, uploaded_by_admin_id, created_at)
           VALUES ($1, 'sermon', $2, $3, NULL, 'image/png', NULL, 2, NULL, now())
           ON CONFLICT (id) DO UPDATE SET owner_id = EXCLUDED.owner_id, file_url = EXCLUDED.file_url, file_type = EXCLUDED.file_type, display_order = EXCLUDED.display_order`,
          [
            `aaaaaaaa-aaaa-4aaa-8aaa-${String(111111111111 + index).padStart(12, '0')}`,
            sermonId,
            recentThumbnail,
          ],
        );
      }
    }

    for (let i = 0; i < galleryPosts.length; i++) {
      const [title, content, thumb] = galleryPosts[i];
      await client.query(
        `INSERT INTO posts (id, board_type, title, content, thumbnail_url, is_pinned, view_count, author_admin_id, created_at, updated_at)
         VALUES ($1, 'gallery', $2, $3, $4, false, 0, NULL, $5, now())
         ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, content = EXCLUDED.content, thumbnail_url = EXCLUDED.thumbnail_url, created_at = EXCLUDED.created_at, updated_at = now()`,
        [galleryIds[i], title, content, thumb, `2026-06-10T12:${String(9 - i).padStart(2, '0')}:00Z`],
      );
    }
    const galleryDetailImages = [
      '/images/gallery/design-detail-main.jpg',
      '/images/gallery/design-detail-1.jpg',
      '/images/gallery/design-detail-2.jpg',
      '/images/gallery/design-detail-3.jpg',
      '/images/gallery/design-detail-4.jpg',
    ];
    for (let index = 0; index < galleryDetailImages.length; index++) {
      await client.query(
        `INSERT INTO attachments (id, owner_type, owner_id, file_url, original_name, file_type, file_size, display_order, uploaded_by_admin_id, created_at)
         VALUES ($1, 'post', $2, $3, NULL, 'image/jpeg', NULL, $4, NULL, now())
         ON CONFLICT (id) DO UPDATE SET owner_id = EXCLUDED.owner_id, file_url = EXCLUDED.file_url, file_type = EXCLUDED.file_type, display_order = EXCLUDED.display_order`,
        [
          `77777777-7777-4777-8777-${String(777777777771 + index).padStart(12, '0')}`,
          UUID.gallery1,
          galleryDetailImages[index],
          index,
        ],
      );
    }
    for (let i = 0; i < notices.length; i++) {
      const [title, content] = notices[i];
      await client.query(
        `INSERT INTO posts (id, board_type, title, content, thumbnail_url, is_pinned, view_count, author_admin_id, created_at, updated_at)
         VALUES ($1, 'notice', $2, $3, NULL, true, 0, NULL, now(), now())
         ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, content = EXCLUDED.content, updated_at = now()`,
        [UUID[`notice${i + 1}`], title, content],
      );
    }
    const eventIds = [UUID.event1, UUID.event2, UUID.event3, UUID.event4];
    for (let i = 0; i < events.length; i++) {
      const [title, desc, start, end, loc, items, fee, contact] = events[i];
      await client.query(
        `INSERT INTO events (id, title, description, start_date, end_date, location, items_to_bring, fee_info, contact_info, cover_image_url, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NULL, now(), now())
         ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description, start_date = EXCLUDED.start_date, end_date = EXCLUDED.end_date, location = EXCLUDED.location, items_to_bring = EXCLUDED.items_to_bring, fee_info = EXCLUDED.fee_info, contact_info = EXCLUDED.contact_info, updated_at = now()`,
        [eventIds[i], title, desc, start, end, loc, items, fee, contact],
      );
    }
    for (const [id, date, title, songs] of setlists) {
      await client.query(
        `INSERT INTO setlists (id, team_id, service_date, title, file_url, youtube_playlist_id, youtube_playlist_title, last_synced_at, sync_status, created_by_admin_id, created_at, updated_at)
         VALUES ($1, NULL, $2, $3, NULL, NULL, NULL, NULL, 'manual', NULL, now(), now())
         ON CONFLICT (id) DO UPDATE SET service_date = EXCLUDED.service_date, title = EXCLUDED.title, updated_at = now()`,
        [id, date, title],
      );
      for (let index = 0; index < songs.length; index++) {
        const [songId, songTitle, artist, videoId, thumbnailUrl] = songs[index];
        await client.query(
          `INSERT INTO setlist_songs (id, setlist_id, display_order, song_title, youtube_video_id, youtube_video_title, thumbnail_url, sheet_file_url, is_unavailable, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, false, now(), now())
           ON CONFLICT (id) DO UPDATE SET
             setlist_id = EXCLUDED.setlist_id,
             display_order = EXCLUDED.display_order,
             song_title = EXCLUDED.song_title,
             youtube_video_id = EXCLUDED.youtube_video_id,
             youtube_video_title = EXCLUDED.youtube_video_title,
             thumbnail_url = EXCLUDED.thumbnail_url,
             is_unavailable = EXCLUDED.is_unavailable,
             updated_at = now()`,
          [songId, id, index, songTitle, videoId, `${artist} - ${songTitle}`, thumbnailUrl],
        );
      }
    }

    const team = await client.query(
      'SELECT id FROM worship_team ORDER BY created_at ASC LIMIT 1',
    );
    if (team.rows[0]) {
      await client.query(
        `UPDATE worship_team
         SET name = 'J-TEEN',
             description = '찬양은 우리의 마음을 하나님께 드리는 가장 아름다운 고백입니다.\nJ-TEEN 찬양팀은 하나님을 향한 예배의 마음으로, 청소년들과 함께 찬양으로 하나되는 공동체입니다.',
             updated_at = now()
         WHERE id = $1`,
        [team.rows[0].id],
      );
      for (let index = 0; index < teamMembers.length; index++) {
        const [id, name, part, bio] = teamMembers[index];
        await client.query(
          `INSERT INTO worship_team_members (id, team_id, name, part, bio, photo_url, display_order, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, NULL, $6, now(), now())
           ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, part = EXCLUDED.part, bio = EXCLUDED.bio, display_order = EXCLUDED.display_order, updated_at = now()`,
          [id, team.rows[0].id, name, part, bio, index],
        );
      }
    }

    const counts = await client.query(
      `SELECT (SELECT count(*) FROM sermons) s, (SELECT count(*) FROM posts) p, (SELECT count(*) FROM events) e, (SELECT count(*) FROM setlists) sl`,
    );
    console.log('Seeded:', JSON.stringify(counts.rows[0]));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
