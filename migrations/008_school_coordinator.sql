ALTER TABLE schools ADD COLUMN coordinator text NOT NULL DEFAULT '';
UPDATE schools s SET coordinator=COALESCE((SELECT c.name FROM school_contacts c WHERE c.school_id=s.id AND lower(c.role)='coordinator' ORDER BY c.created_at,c.id LIMIT 1),'');
