-- BHH Pre-production v0004 — preserve original Apps Script Drive folder tree.
-- D1 stores references only. Apps Script DriveApp owns and manages folders/files.
CREATE TABLE IF NOT EXISTS submission_drive_folders (
  submission_id TEXT PRIMARY KEY REFERENCES submissions(id) ON DELETE CASCADE,
  root_folder_id TEXT NOT NULL,
  root_folder_url TEXT NOT NULL,
  folder_map_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_submission_drive_root ON submission_drive_folders(root_folder_id);
