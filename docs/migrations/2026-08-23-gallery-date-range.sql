ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS start_date date,
  ADD COLUMN IF NOT EXISTS end_date date;

UPDATE posts
SET start_date = (created_at AT TIME ZONE 'Asia/Seoul')::date
WHERE board_type = 'gallery'
  AND start_date IS NULL;

CREATE INDEX IF NOT EXISTS "IDX_posts_start_date"
  ON posts (start_date);
