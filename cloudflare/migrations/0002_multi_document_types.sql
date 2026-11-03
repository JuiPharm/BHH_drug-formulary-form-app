-- Allow multiple research evidence or image files of the same type and version.
-- Preserve any records written during preproduction. No production data involved.
CREATE TABLE IF NOT EXISTS documents_v2 (
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
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO documents_v2
  (id, submission_id, document_type, version, storage_key, original_filename, mime_type, size_bytes, sha256, review_status, created_at)
SELECT id, submission_id, document_type, version, storage_key, original_filename, mime_type, size_bytes, sha256, review_status, created_at
FROM documents;
DROP TABLE documents;
ALTER TABLE documents_v2 RENAME TO documents;
CREATE INDEX IF NOT EXISTS idx_documents_submission ON documents(submission_id, document_type);
