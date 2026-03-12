# Business Logic - CoordinatorMCP

## 📋 USAGE INSTRUCTIONS

### For Claude.ai:
- Read this file to understand what the system does BEFORE planning changes
- Use it to detect gaps between what exists and what's needed
- When planning a new feature, check here first for dependencies

### For Claude Code:
- **REQUIRED:** After every task that adds/modifies functionality,
  update the relevant sections of this file
- Only document what IS implemented, never what WILL BE
- If a feature is removed, remove it from this file
- Keep descriptions functional (what the user can do), not technical

### For the Developer:
- Use this as a quick reference to review the system's capabilities
- Use it to identify gaps or missing business rules

---

## System Overview
CoordinatorMCP is a remote MCP server that enables Claude.ai to send task instructions to Claude Code and monitor execution progress. It serves as a persistent bridge between the two tools, with data isolated per project via project_id. Claude.ai can also read project code directly from GitHub repositories without requiring file sync.

## User Roles

### Claude.ai (Planner)
- **Can do:** Create instructions, list instructions, read progress reports, update/delete instructions, list/read synced project files, send code changes, update workflow docs, get project status, search history
- **Cannot do:** Execute code, modify files directly on the developer's machine

### Claude Code (Implementor)
- **Can do:** Get pending instructions (auto-marks as in_progress), submit progress reports, sync files/file trees to R2
- **Cannot do:** Create instructions, delete instructions, modify other projects' data

### Developer
- **Can do:** Connect via OAuth, configure tools in Claude.ai/Claude Code, approve/reject changes
- **Cannot do:** Interact with the MCP API directly without an MCP client

## Modules

### Instruction Management

**Purpose:** Queue and track tasks between Claude.ai and Claude Code

**What users can do:**
- Create an instruction with title, content, priority (low/normal/high/urgent), type (standard/direct_change), and optional detailed markdown stored in R2
- List instructions filtered by status (pending/in_progress/completed/all) and project_id
- Update an instruction's title, content, priority, or status
- Delete an instruction and all its associated progress reports (cascade)
- Send a direct code change instruction with file path, change type, and new content

**Business rules in effect:**
- Every instruction belongs to a project_id (defaults to "default")
- Instructions are created with status "pending"
- get_pending_instructions automatically changes status to "in_progress"
- submit_progress with status "completed" automatically changes the instruction status to "completed"
- Deleting an instruction cascades to delete all its progress_reports
- Instructions are ordered by priority (urgent > high > normal > low) then by created_at

### Progress Reporting

**Purpose:** Claude Code reports back on task execution status

**What users can do:**
- Submit a progress report for an instruction with status (in_progress/completed/blocked), summary, optional details, and optional full_report (detailed report stored in R2)
- Read progress reports filtered by instruction_id and/or project_id
- Read the complete full_report for a specific progress report via read_full_report

**Business rules in effect:**
- Each report is linked to an instruction via instruction_id
- Reports include project_id for isolation
- Submitting "completed" status auto-updates the parent instruction
- Reports are ordered by created_at descending, limited to 20
- full_report content is stored in R2 at `projects/{project_id}/reports/{report_id}.md` and referenced via full_report_ref in D1
- read_full_report retrieves the full report content from R2 by report_id

### File Synchronization

**Purpose:** Make project source code available to Claude.ai for remote reading

**What users can do:**
- Sync individual files (path + content) to R2 with metadata in D1
- Sync an entire file tree (batch upload), auto-excluding node_modules, .next, .git, dist, and dotfiles
- List synced files filtered by path prefix and project_id
- Read file content from R2 via file path lookup

**Business rules in effect:**
- Files are stored in R2 at `projects/{project_id}/files/{path}`
- D1 tracks file metadata (path, R2 key, size, sync timestamp)
- file_path has a UNIQUE constraint — re-syncing overwrites (UPSERT)
- sync_file_tree filters out common build/dependency directories
- All file operations are scoped by project_id

### GitHub Code Reading

**Purpose:** Allow Claude.ai to read project source code directly from GitHub repositories without requiring file sync

**What users can do:**
- Read the content of a specific file from a GitHub repository (github_read_file) by specifying owner, repo, path, and optional branch
- List files in a directory of a GitHub repository (github_list_files) by specifying owner, repo, optional path, and optional branch
- Get the complete file tree of a GitHub repository (github_read_tree) with all file paths and sizes

**Business rules in effect:**
- Requires a GITHUB_PAT secret configured in Cloudflare Workers
- All requests go through the GitHub REST API (api.github.com)
- File content is decoded from base64 automatically
- Branch defaults to "main" if not specified
- Owner and repo are required parameters for all 3 tools
- These tools are read-only — they cannot modify repository content

### Project Status & Search

**Purpose:** Overview and historical search across instructions and reports

**What users can do:**
- Get a project status summary: instruction counts by status, file count, last 5 progress reports
- Search instructions and progress reports by keyword across title, content, summary, and details

**Business rules in effect:**
- Status and search are scoped by project_id
- Search uses SQL LIKE with wildcard matching
- Results are limited (50 for instructions, 10 for search, 5 for recent activity)

### Authentication (OAuth)

**Purpose:** Secure access to the MCP server from Claude.ai and Claude Code

**What users can do:**
- Connect from Claude.ai via Settings → Integrations → Add custom connector
- Authenticate via GitHub OAuth flow (redirect → authorize → callback → token)
- Connect from Claude Code via `claude mcp add`

**Business rules in effect:**
- OAuth tokens are stored in Cloudflare KV (OAUTH_KV binding)
- The OAuthProvider wraps all /mcp endpoints — unauthenticated requests get 401
- GitHub user info (login, name, email) is stored as OAuth props
- Dynamic Client Registration is supported at /register
- Both /mcp (Streamable HTTP) and /sse (SSE) transports are available

## Data Formats and Conventions
- IDs: 8-character UUID substring (e.g., "4ac34dab")
- Timestamps: ISO format without 'T', sliced to 19 chars (e.g., "2026-03-11 12:31:16")
- project_id: lowercase string, typically matching the GitHub repo name (e.g., "coordinatormcp")
- R2 keys: hierarchical paths (e.g., "projects/coordinatormcp/files/src/index.ts")
