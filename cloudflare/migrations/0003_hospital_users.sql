-- v0003: protect administrative APIs with Cloudflare Access identity + D1 role.
-- No default user is authorized: admins must be provisioned separately after review.
CREATE TABLE IF NOT EXISTS hospital_users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT,
  role TEXT NOT NULL CHECK (role IN ('SYSTEM_ADMIN','PHARMACIST','PTC_SECRETARY','PTC_MEMBER')),
  is_active INTEGER NOT NULL DEFAULT 0 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_hospital_users_active ON hospital_users(is_active,role);
