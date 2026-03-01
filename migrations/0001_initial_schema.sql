-- CoordinatorMCP Initial Schema
-- Tables: instructions, progress_reports, project_files

CREATE TABLE IF NOT EXISTS instructions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  detail_ref TEXT,
  type TEXT NOT NULL DEFAULT 'standard',
  priority TEXT NOT NULL DEFAULT 'normal',
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS progress_reports (
  id TEXT PRIMARY KEY,
  instruction_id TEXT NOT NULL,
  status TEXT NOT NULL,
  summary TEXT NOT NULL,
  details TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (instruction_id) REFERENCES instructions(id)
);

CREATE TABLE IF NOT EXISTS project_files (
  id TEXT PRIMARY KEY,
  file_path TEXT NOT NULL UNIQUE,
  r2_key TEXT NOT NULL,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  synced_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_instructions_status ON instructions(status);
CREATE INDEX IF NOT EXISTS idx_progress_instruction ON progress_reports(instruction_id);
CREATE INDEX IF NOT EXISTS idx_files_path ON project_files(file_path);
