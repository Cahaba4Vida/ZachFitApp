ALTER TABLE member_week_state
ADD COLUMN IF NOT EXISTS goals TEXT DEFAULT '';

INSERT INTO teams (id, name)
VALUES ('all', 'All Teams')
ON CONFLICT (id) DO NOTHING;
