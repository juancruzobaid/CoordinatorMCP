-- Migration: Add project_id support for multi-project isolation
-- Each table gets a project_id column with index for filtering

ALTER TABLE instructions ADD COLUMN project_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE progress_reports ADD COLUMN project_id TEXT NOT NULL DEFAULT 'default';
ALTER TABLE project_files ADD COLUMN project_id TEXT NOT NULL DEFAULT 'default';

CREATE INDEX IF NOT EXISTS idx_instructions_project ON instructions(project_id);
CREATE INDEX IF NOT EXISTS idx_progress_project ON progress_reports(project_id);
CREATE INDEX IF NOT EXISTS idx_files_project ON project_files(project_id);
