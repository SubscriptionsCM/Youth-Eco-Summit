-- Progress is separate from versioned form answers; files retain their original names.
ALTER TABLE submissions ADD COLUMN current_step text NOT NULL DEFAULT 'details' CHECK(current_step IN ('details','team','upload','review'));
ALTER TABLE submissions ADD COLUMN submission_title text;
ALTER TABLE assets ADD COLUMN role text;
ALTER TABLE assets ADD COLUMN metadata jsonb NOT NULL DEFAULT '{}';
ALTER TABLE assets ADD COLUMN generated_name text;
CREATE INDEX assets_revision_role ON assets(submission_id,revision,role) WHERE trashed_at IS NULL;
