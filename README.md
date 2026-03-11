# CoordinatorMCP

A remote MCP (Model Context Protocol) server that coordinates work between a **planning agent** (Claude.AI) and an **implementation agent** (Claude Code). It acts as a task orchestration and file synchronization hub, enabling two-agent collaboration for software development workflows.

## How it works

1. **Planner (Claude.AI)** creates instructions with priority levels and optional detailed markdown
2. **Implementor (Claude Code)** picks up pending instructions, executes them, and syncs modified files
3. Both agents track progress through status reports and project summaries

## Tech Stack

- **Cloudflare Workers** — Serverless runtime
- **Cloudflare D1** — SQLite database for instructions, progress reports, and file metadata
- **Cloudflare R2** — Object storage for synced project files and documentation
- **Cloudflare KV** — OAuth state management
- **GitHub OAuth 2.0** — Authentication via `@cloudflare/workers-oauth-provider`
- **Hono** — HTTP routing for OAuth callbacks
- **Zod** — Schema validation for tool parameters
- **TypeScript** — Strict mode

## MCP Tools

### For the Planner (Claude.AI)

| Tool | Description |
|------|-------------|
| `create_instruction` | Create a new instruction with title, content, priority, and optional detailed markdown |
| `list_instructions` | List instructions filtered by status (pending/in_progress/completed/all) |
| `read_progress` | Read progress reports, optionally filtered by instruction ID |
| `update_instruction` | Update an instruction's content, priority, or status |
| `delete_instruction` | Delete an instruction and its associated progress reports |
| `update_workflow_docs` | Create or update workflow/documentation files in R2 |

### For the Implementor (Claude Code)

| Tool | Description |
|------|-------------|
| `get_pending_instructions` | Retrieve pending instructions (auto-marks as in_progress) |
| `submit_progress` | Submit a progress report (in_progress/completed/blocked) |
| `sync_files` | Upload project files to R2 with DB tracking |
| `sync_file_tree` | Bulk sync a complete file tree to R2 |

### Shared

| Tool | Description |
|------|-------------|
| `get_project_status` | Get instruction counts, file count, and recent activity |
| `search_history` | Search instructions and progress reports by keyword |
| `list_project_files` | List synced files with optional path prefix filter |
| `read_file` | Read a synced project file from R2 |
| `send_code_change` | Send a direct code change instruction (replace_file or replace_lines) |

## Setup

### Prerequisites

- Node.js
- A Cloudflare account with Workers, D1, R2, and KV enabled
- A GitHub OAuth App (for authentication)

### Environment Variables

```
GITHUB_CLIENT_ID=<your-github-oauth-app-id>
GITHUB_CLIENT_SECRET=<your-github-oauth-app-secret>
COOKIE_ENCRYPTION_KEY=<random-encryption-key>
```

### Development

```bash
npm install
npm run dev
```

### Deploy

```bash
npm run deploy
```

### Connect from Claude Code

Add to your MCP settings:

```json
{
  "mcpServers": {
    "coordinator": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://mcp.juancruz.com.ar/mcp"
      ]
    }
  }
}
```
