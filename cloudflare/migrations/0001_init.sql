-- BHH Drug Formulary & PTC pre-production schema v0001.
-- D1 / SQLite. Never import actual hospital submissions without a reviewed migration.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS companies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_companies_name ON companies(normalized_name);

CREATE TABLE IF NOT EXISTS representatives (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_representatives_company ON representatives(company_id);

CREATE TABLE IF NOT EXISTS submissions (
  id TEXT PRIMARY KEY,
  submission_no TEXT NOT NULL UNIQUE,
  company_id TEXT REFERENCES companies(id),
  representative_id TEXT REFERENCES representatives(id),
  brand_name TEXT NOT NULL,
  generic_name TEXT,
  strength TEXT,
  dosage_form TEXT,
  product_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  submitted_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0)
);
CREATE INDEX IF NOT EXISTS idx_submissions_status_date ON submissions(status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_submissions_product_key ON submissions(product_key);
CREATE INDEX IF NOT EXISTS idx_submissions_company ON submissions(company_id,created_at DESC);

CREATE TABLE IF NOT EXISTS drug_products (
  submission_id TEXT PRIMARY KEY REFERENCES submissions(id) ON DELETE CASCADE,
  clinical_data_json TEXT NOT NULL DEFAULT '{}',
  product_data_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS physician_proposals (
  submission_id TEXT PRIMARY KEY REFERENCES submissions(id) ON DELETE CASCADE,
  physician_name TEXT NOT NULL,
  specialty TEXT,
  urgency TEXT,
  details_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL REFERENCES submissions(id),
  document_type TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  storage_key TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  sha256 TEXT NOT NULL,
  review_status TEXT NOT NULL DEFAULT 'PENDING',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(submission_id,document_type,version)
);
CREATE INDEX IF NOT EXISTS idx_documents_submission ON documents(submission_id,document_type);

CREATE TABLE IF NOT EXISTS status_history (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL REFERENCES submissions(id),
  previous_status TEXT,
  new_status TEXT NOT NULL,
  changed_by TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  changed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_history_submission_date ON status_history(submission_id,changed_at DESC);

CREATE TABLE IF NOT EXISTS submission_comments (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL REFERENCES submissions(id),
  comment_text TEXT NOT NULL CHECK (length(trim(comment_text)) BETWEEN 1 AND 2000),
  visibility TEXT NOT NULL DEFAULT 'INTERNAL'
    CHECK (visibility IN ('INTERNAL','COMPANY_VISIBLE','ACTION_REQUIRED')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  source_legacy_id TEXT UNIQUE
);
CREATE INDEX IF NOT EXISTS idx_comments_submission_date ON submission_comments(submission_id,created_at DESC);

CREATE TABLE IF NOT EXISTS signatures (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL REFERENCES submissions(id),
  signer_role TEXT NOT NULL,
  signer_snapshot_json TEXT NOT NULL,
  document_version INTEGER NOT NULL,
  signed_at TEXT NOT NULL,
  verification_method TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  sha256 TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_signatures_submission ON signatures(submission_id);

CREATE TABLE IF NOT EXISTS ptc_meetings (
  id TEXT PRIMARY KEY,
  meeting_no TEXT NOT NULL UNIQUE,
  scheduled_at TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS ptc_agenda_items (
  id TEXT PRIMARY KEY,
  meeting_id TEXT NOT NULL REFERENCES ptc_meetings(id),
  submission_id TEXT NOT NULL REFERENCES submissions(id),
  sequence_no INTEGER NOT NULL,
  UNIQUE(meeting_id,submission_id)
);
CREATE TABLE IF NOT EXISTS ptc_decisions (
  id TEXT PRIMARY KEY,
  agenda_item_id TEXT NOT NULL UNIQUE REFERENCES ptc_agenda_items(id),
  decision TEXT NOT NULL CHECK (decision IN ('APPROVED','REJECTED','DEFERRED','CONDITIONAL')),
  conditions_json TEXT NOT NULL DEFAULT '{}',
  recorded_by TEXT NOT NULL,
  recorded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  request_id TEXT,
  detail_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type,entity_id,created_at DESC);
