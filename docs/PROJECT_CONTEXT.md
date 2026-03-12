# CoordinatorMCP - Project Context

## Project Purpose
CoordinatorMCP is a persistent communication bridge between Claude.ai (planner) and Claude Code (implementor). It enables a hybrid development workflow where Claude.ai creates task instructions, and Claude Code picks them up, executes them, and reports progress — all through a shared MCP server. Each project/repo gets its own isolated namespace via `project_id`. Claude.ai can also read project code directly from GitHub via built-in GitHub API tools (github_read_file, github_list_files, github_read_tree) and access detailed progress reports stored in R2 via read_full_report.

**Version:** 4.0.0

## CoordinatorMCP
- **project_id:** coordinatormcp
- **URL:** https://mcp.juancruz.com.ar/mcp

## Current Technology Stack
- **Runtime:** Cloudflare Workers (TypeScript)
- **Database:** Cloudflare D1 (SQLite) — `coordinator-db`
- **Object Storage:** Cloudflare R2 — `coordinator-bucket`
- **Key-Value Store:** Cloudflare KV — `OAUTH_KV` (for OAuth tokens)
- **Durable Objects:** `MyMCP` class (MCP session management)
- **Authentication:** GitHub OAuth via `@cloudflare/workers-oauth-provider`
- **Web Framework:** Hono (for OAuth handler routes)
- **MCP SDK:** `@modelcontextprotocol/sdk` + `agents` (Cloudflare Agents SDK)
- **Schema Validation:** Zod
- **Hosting/Deployment:** Cloudflare Workers via Wrangler CLI
- **Domain:** mcp.juancruz.com.ar (custom domain via Cloudflare DNS)
- **Version Control:** GitHub — github.com/juancruzobaid/CoordinatorMCP

## System Architecture
```
┌─────────────────┐     ┌──────────────────────────────────┐
│   Claude.ai     │     │   Cloudflare Workers             │
│   (Planner)     │────▶│   mcp.juancruz.com.ar/mcp        │
│                 │◀────│                                  │
└─────────────────┘     │   ┌────────────┐                 │
                        │   │ OAuthProvider                │
┌─────────────────┐     │   │ (GitHub OAuth)               │
│   Claude Code   │     │   └────────────┘                 │
│   (Implementor) │────▶│                                  │
│                 │◀────│   ┌────────────┐  ┌───────────┐  │
└─────────────────┘     │   │ MyMCP (DO) │  │ D1 (SQL)  │  │
                        │   │ 19 tools   │──│ 3 tables  │  │
                        │   └────────────┘  └───────────┘  │
                        │                                  │
                        │   ┌───────────┐  ┌───────────┐   │
                        │   │ R2 (files) │  │ KV (auth) │   │
                        │   └───────────┘  └───────────┘   │
                        └──────────────────────────────────┘
```

## Database Structure (D1)

### `instructions`
- Purpose: Queue of tasks from Claude.ai to Claude Code
- Key fields: id (TEXT PK), title (TEXT), content (TEXT), detail_ref (TEXT nullable — R2 path for long content), type (TEXT: standard|direct_change), priority (TEXT: low|normal|high|urgent), status (TEXT: pending|in_progress|completed), project_id (TEXT), created_at (TEXT), updated_at (TEXT)
- Indexes: idx_instructions_status, idx_instructions_project

### `progress_reports`
- Purpose: Status reports from Claude Code back to Claude.ai
- Key fields: id (TEXT PK), instruction_id (TEXT FK → instructions), status (TEXT: in_progress|completed|blocked), summary (TEXT), details (TEXT nullable), project_id (TEXT), created_at (TEXT)
- Indexes: idx_progress_instruction, idx_progress_project

### `project_files`
- Purpose: Registry of synced source code files stored in R2
- Key fields: id (TEXT PK), file_path (TEXT UNIQUE), r2_key (TEXT), size_bytes (INTEGER), project_id (TEXT), synced_at (TEXT)
- Indexes: idx_files_path, idx_files_project

## R2 Storage Structure
```
projects/
  {project_id}/
    files/          # Synced source code files
    instructions/   # Detail markdown (.md) and code changes (.json)
    docs/           # Workflow documentation
```

## Critical Business Rules
1. Every tool call that reads/writes data MUST include project_id for isolation
2. `get_pending_instructions` automatically marks instructions as `in_progress`
3. `submit_progress` with status `completed` automatically updates the instruction status
4. `sync_file_tree` excludes node_modules/, .next/, .git/, dist/, and dotfiles
5. OAuth tokens are stored in KV, never in code or environment variables directly

## Development Principles
- TypeScript strict mode
- All MCP tools use Zod for input validation
- project_id defaults to "default" if not provided (backward compatibility)
- Short UUIDs (8 chars) for readable IDs
- ISO datetime format without 'T' separator for SQL compatibility

## Coding Conventions
- **File names:** kebab-case for source files (github-handler.ts, utils.ts)
- **Folder structure:** src/ for source, migrations/ for D1 SQL
- **Exports:** Named export for MyMCP class, default export for OAuthProvider
- **Tool naming:** snake_case (create_instruction, get_project_status)

## Critical Dependencies
- `@cloudflare/workers-oauth-provider@^0.2.4`: OAuth 2.1 implementation for MCP auth
- `agents@^0.5.0`: Cloudflare Agents SDK (McpAgent class)
- `hono@^4.12.4`: Web framework for OAuth routes
- `zod@^4.3.6`: Schema validation for tool inputs
- `wrangler@^4.69.0`: Cloudflare deployment CLI
- **Secrets:** `GITHUB_PAT` (GitHub Personal Access Token for GitHub API tools)

## Known Technical Debt
- package.json still has name "remote-mcp-server-authless" from the original template
- `project_files` UNIQUE constraint is on `file_path` only, not `file_path + project_id` — could cause conflicts if two projects have the same file path
- No health check endpoint (OAuthProvider intercepted the original `/health` route)
- GitHub OAuth callback URL is hardcoded to mcp.juancruz.com.ar in utils.ts
- `.DS_Store` and `package-lock.json` are not in `.gitignore`
