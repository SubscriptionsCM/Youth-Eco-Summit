ALTER TABLE judge_assignments ADD COLUMN revision_invalidated boolean NOT NULL DEFAULT false;
ALTER TABLE review_rounds ADD COLUMN prerequisite_round_ids jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(prerequisite_round_ids)='array');
