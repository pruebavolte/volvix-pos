-- Google OAuth users link (PENDIENTE)
CREATE TABLE IF NOT EXISTS google_oauth_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES pos_users(id),
  google_sub TEXT UNIQUE,
  google_email TEXT, google_name TEXT, google_picture TEXT,
  linked_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE google_oauth_users ENABLE ROW LEVEL SECURITY;
