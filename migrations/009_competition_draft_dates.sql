-- Draft programmes can be prepared before entry dates have been confirmed.
-- Keep the existing chronological constraint and require dates for live records.
ALTER TABLE competitions ALTER COLUMN opens_at DROP NOT NULL;
ALTER TABLE competitions ALTER COLUMN closes_at DROP NOT NULL;
ALTER TABLE competitions ADD CONSTRAINT competition_published_dates_required
  CHECK (status = 'draft' OR (opens_at IS NOT NULL AND closes_at IS NOT NULL));
