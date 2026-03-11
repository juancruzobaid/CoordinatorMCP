# Master Plan - CoordinatorMCP

## Product Vision
A unified MCP server that acts as the persistent coordination layer between Claude.ai and Claude Code across all development projects. One server, multiple projects, complete isolation.

## Current Project Status
**Phase:** Production
**Last Update:** 2026-03-11
**Version:** 3.0.0

## Feature Roadmap

### ✅ COMPLETED

#### Cloudflare Workers Setup - 2026-03-01
- **Description:** Initial project setup with Cloudflare Workers, D1, R2, custom domain
- **Main Files:** `wrangler.jsonc`, `src/index.ts`
- **Endpoints:** `https://mcp.juancruz.com.ar/mcp`

#### MCP Tools Implementation (15 tools) - 2026-03-02
- **Description:** Full set of MCP tools for bidirectional Claude.ai ↔ Claude Code communication
- **Main Files:** `src/index.ts`
- **Tools:** create_instruction, list_instructions, read_progress, update_instruction, delete_instruction, list_project_files, read_file, send_code_change, update_workflow_docs, get_pending_instructions, submit_progress, sync_files, sync_file_tree, get_project_status, search_history

#### D1 Schema with 3 Tables - 2026-03-02
- **Description:** Database schema for instructions, progress_reports, and project_files
- **Main Files:** `migrations/0001_initial_schema.sql`

#### GitHub OAuth Authentication - 2026-03-03
- **Description:** OAuth 2.1 via GitHub so Claude.ai can connect securely as a connector
- **Main Files:** `src/index.ts`, `src/github-handler.ts`, `src/utils.ts`
- **Dependencies:** `@cloudflare/workers-oauth-provider`, `hono`

#### Multi-Project Isolation (project_id) - 2026-03-11
- **Description:** Added project_id column to all tables and all tools for per-repo data isolation
- **Main Files:** `migrations/0002_add_project_id.sql`, `src/index.ts`

#### SSE + Streamable HTTP Transport - 2026-03-11
- **Description:** Both /mcp (Streamable HTTP) and /sse (SSE) endpoints for client compatibility
- **Main Files:** `src/index.ts` (apiHandlers config)

### 🚧 IN PROGRESS
- None currently

### 📋 PRIORITIZED BACKLOG

#### High Priority
- [ ] **Fix project_files UNIQUE constraint:** Add project_id to the UNIQUE constraint on file_path to prevent cross-project conflicts
- [ ] **Health check endpoint:** Add a /health route that bypasses OAuth for uptime monitoring

#### Medium Priority
- [ ] **Fix package.json name:** Change from "remote-mcp-server-authless" to "coordinatormcp"
- [ ] **Project documentation:** Generate the 4 standard docs (PROJECT_CONTEXT, MASTER_PLAN, BUSINESS_LOGIC, IMPLEMENTATION_LOG)

#### Low Priority / Nice to Have
- [ ] **Rate limiting:** Prevent abuse on public-facing MCP endpoints
- [ ] **Usage metrics:** Track tool call counts per project for analytics
- [ ] **File diff sync:** Only sync changed portions of files instead of full content
- [ ] **Notification system:** Alert developer when Claude Code reports a blocked task

## Architectural Decisions

### GitHub OAuth over API Keys
- **Context:** Claude.ai requires OAuth for custom MCP connectors
- **Decision:** Use GitHub OAuth via workers-oauth-provider
- **Alternatives:** API key auth (not supported by Claude.ai connectors), Cloudflare Access (more complex)
- **Consequences:** Requires GitHub OAuth App setup, but works natively with Claude.ai

### D1 + R2 Hybrid Storage
- **Context:** Need structured queries (instructions, progress) AND large file storage (code files)
- **Decision:** D1 for metadata/queries, R2 for file content and instruction details
- **Alternatives:** D1-only (blob limits), R2-only (no SQL queries)
- **Consequences:** Two storage systems to maintain, but each used for its strength

### project_id as Column vs Separate Databases
- **Context:** Need to isolate data per repo/project
- **Decision:** Single database with project_id column on all tables
- **Alternatives:** Separate D1 databases per project (complex, expensive)
- **Consequences:** Simpler management, all tools need project_id parameter
