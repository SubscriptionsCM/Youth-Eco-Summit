ALTER TABLE publications ADD COLUMN asset_ids jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(asset_ids) = 'array');
