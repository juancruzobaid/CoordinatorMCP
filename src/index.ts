import OAuthProvider from "@cloudflare/workers-oauth-provider";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpAgent } from "agents/mcp";
import { z } from "zod";
import GitHubHandler from "./github-handler";

// Helper: generate a short unique ID
function genId(): string {
  return crypto.randomUUID().slice(0, 8);
}

// Helper: get current ISO datetime
function now(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

// Default project ID (single-project for now)
const PROJECT_ID = "default";

export class MyMCP extends McpAgent {
  server = new McpServer({
    name: "CoordinatorMCP",
    version: "2.0.0",
  });

  async init() {
    // ============================================================
    // TOOLS FOR CLAUDE.AI (Planner)
    // ============================================================

    // --- create_instruction ---
    this.server.tool(
      "create_instruction",
      "Create a new instruction for Claude Code to execute",
      {
        title: z.string().describe("Short title for the instruction"),
        content: z.string().describe("The instruction content/description"),
        priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
        type: z.enum(["standard", "direct_change"]).optional(),
        detail_md: z
          .string()
          .optional()
          .describe("Optional detailed markdown content to store in R2"),
      },
      async ({ title, content, priority, type, detail_md }) => {
        const env = this.env as Env;
        const id = genId();
        const ts = now();
        let detail_ref: string | null = null;

        if (detail_md) {
          const r2Key = `projects/${PROJECT_ID}/instructions/${id}.md`;
          await env.COORDINATOR_BUCKET.put(r2Key, detail_md);
          detail_ref = r2Key;
        }

        await env.COORDINATOR_DB.prepare(
          `INSERT INTO instructions (id, title, content, detail_ref, type, priority, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
        )
          .bind(
            id,
            title,
            content,
            detail_ref,
            type || "standard",
            priority || "normal",
            ts,
            ts,
          )
          .run();

        return {
          content: [
            {
              type: "text",
              text: `✅ Instruction created: [${id}] "${title}" (${priority || "normal"} priority, status: pending)`,
            },
          ],
        };
      },
    );

    // --- list_instructions ---
    this.server.tool(
      "list_instructions",
      "List instructions filtered by status",
      {
        status: z
          .enum(["pending", "in_progress", "completed", "all"])
          .optional(),
      },
      async ({ status }) => {
        const env = this.env as Env;
        let query =
          "SELECT id, title, type, priority, status, created_at, updated_at FROM instructions";
        const filterStatus = status || "all";

        if (filterStatus !== "all") {
          query += ` WHERE status = '${filterStatus}'`;
        }
        query += " ORDER BY created_at DESC LIMIT 50";

        const results = await env.COORDINATOR_DB.prepare(query).all();
        const rows = results.results || [];

        if (rows.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `No instructions found (filter: ${filterStatus})`,
              },
            ],
          };
        }

        const lines = rows.map(
          (r: any) =>
            `[${r.id}] ${r.status.toUpperCase()} | ${r.priority} | ${r.title} (${r.updated_at})`,
        );

        return {
          content: [
            {
              type: "text",
              text: `📋 Instructions (${filterStatus}):\n${lines.join("\n")}`,
            },
          ],
        };
      },
    );

    // --- read_progress ---
    this.server.tool(
      "read_progress",
      "Read progress reports, optionally filtered by instruction ID",
      {
        instruction_id: z
          .string()
          .optional()
          .describe("Filter by instruction ID"),
      },
      async ({ instruction_id }) => {
        const env = this.env as Env;
        let query =
          "SELECT pr.id, pr.instruction_id, pr.status, pr.summary, pr.details, pr.created_at, i.title as instruction_title FROM progress_reports pr LEFT JOIN instructions i ON pr.instruction_id = i.id";

        if (instruction_id) {
          query += ` WHERE pr.instruction_id = '${instruction_id}'`;
        }
        query += " ORDER BY pr.created_at DESC LIMIT 20";

        const results = await env.COORDINATOR_DB.prepare(query).all();
        const rows = results.results || [];

        if (rows.length === 0) {
          return {
            content: [{ type: "text", text: "No progress reports found." }],
          };
        }

        const lines = rows.map(
          (r: any) =>
            `[${r.id}] for instruction "${r.instruction_title}" [${r.instruction_id}]\n  Status: ${r.status} | ${r.created_at}\n  Summary: ${r.summary}${r.details ? "\n  Details: " + r.details.slice(0, 200) : ""}`,
        );

        return {
          content: [
            {
              type: "text",
              text: `📊 Progress Reports:\n${lines.join("\n\n")}`,
            },
          ],
        };
      },
    );

    // --- update_instruction ---
    this.server.tool(
      "update_instruction",
      "Update an existing instruction's content, priority or status",
      {
        id: z.string().describe("Instruction ID"),
        title: z.string().optional(),
        content: z.string().optional(),
        priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
        status: z.enum(["pending", "in_progress", "completed"]).optional(),
      },
      async ({ id, title, content, priority, status }) => {
        const env = this.env as Env;
        const sets: string[] = [];
        const values: any[] = [];

        if (title) {
          sets.push("title = ?");
          values.push(title);
        }
        if (content) {
          sets.push("content = ?");
          values.push(content);
        }
        if (priority) {
          sets.push("priority = ?");
          values.push(priority);
        }
        if (status) {
          sets.push("status = ?");
          values.push(status);
        }

        if (sets.length === 0) {
          return {
            content: [{ type: "text", text: "❌ No fields to update." }],
          };
        }

        sets.push("updated_at = ?");
        values.push(now());
        values.push(id);

        await env.COORDINATOR_DB.prepare(
          `UPDATE instructions SET ${sets.join(", ")} WHERE id = ?`,
        )
          .bind(...values)
          .run();

        return {
          content: [{ type: "text", text: `✅ Instruction [${id}] updated.` }],
        };
      },
    );

    // --- delete_instruction ---
    this.server.tool(
      "delete_instruction",
      "Delete an instruction by ID",
      { id: z.string().describe("Instruction ID to delete") },
      async ({ id }) => {
        const env = this.env as Env;
        await env.COORDINATOR_DB.prepare(
          "DELETE FROM progress_reports WHERE instruction_id = ?",
        )
          .bind(id)
          .run();
        await env.COORDINATOR_DB.prepare(
          "DELETE FROM instructions WHERE id = ?",
        )
          .bind(id)
          .run();
        return {
          content: [
            {
              type: "text",
              text: `🗑️ Instruction [${id}] and its reports deleted.`,
            },
          ],
        };
      },
    );

    // --- list_project_files ---
    this.server.tool(
      "list_project_files",
      "List synced project files with optional path prefix filter",
      {
        prefix: z
          .string()
          .optional()
          .describe("Filter by path prefix, e.g. 'src/' or 'components/'"),
      },
      async ({ prefix }) => {
        const env = this.env as Env;
        let query =
          "SELECT file_path, size_bytes, synced_at FROM project_files";
        if (prefix) {
          query += ` WHERE file_path LIKE '${prefix}%'`;
        }
        query += " ORDER BY file_path ASC LIMIT 100";

        const results = await env.COORDINATOR_DB.prepare(query).all();
        const rows = results.results || [];

        if (rows.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `No files found${prefix ? ` with prefix "${prefix}"` : ""}.`,
              },
            ],
          };
        }

        const lines = rows.map(
          (r: any) =>
            `  ${r.file_path} (${r.size_bytes} bytes, synced: ${r.synced_at})`,
        );

        return {
          content: [
            {
              type: "text",
              text: `📁 Project Files (${rows.length}):\n${lines.join("\n")}`,
            },
          ],
        };
      },
    );

    // --- read_file ---
    this.server.tool(
      "read_file",
      "Read the content of a synced project file from R2",
      {
        file_path: z
          .string()
          .describe("The file path as stored in project_files"),
      },
      async ({ file_path }) => {
        const env = this.env as Env;

        const row = await env.COORDINATOR_DB.prepare(
          "SELECT r2_key FROM project_files WHERE file_path = ?",
        )
          .bind(file_path)
          .first<{ r2_key: string }>();

        if (!row) {
          return {
            content: [
              { type: "text", text: `❌ File not found: ${file_path}` },
            ],
          };
        }

        const obj = await env.COORDINATOR_BUCKET.get(row.r2_key);
        if (!obj) {
          return {
            content: [
              {
                type: "text",
                text: `❌ File exists in DB but not in R2: ${file_path}`,
              },
            ],
          };
        }

        const text = await obj.text();
        return {
          content: [
            { type: "text", text: `📄 ${file_path}:\n\`\`\`\n${text}\n\`\`\`` },
          ],
        };
      },
    );

    // --- send_code_change ---
    this.server.tool(
      "send_code_change",
      "Send a direct code change instruction (replace_file or replace_lines)",
      {
        file_path: z.string().describe("Target file path"),
        change_type: z.enum(["replace_file", "replace_lines"]),
        new_content: z
          .string()
          .describe("The new content for the file or lines"),
        line_start: z
          .number()
          .optional()
          .describe("Start line (for replace_lines)"),
        line_end: z
          .number()
          .optional()
          .describe("End line (for replace_lines)"),
        description: z
          .string()
          .optional()
          .describe("Description of the change"),
      },
      async ({
        file_path,
        change_type,
        new_content,
        line_start,
        line_end,
        description,
      }) => {
        const env = this.env as Env;
        const id = genId();
        const ts = now();

        const changeDetail = JSON.stringify({
          file_path,
          change_type,
          new_content,
          line_start,
          line_end,
        });

        const r2Key = `projects/${PROJECT_ID}/instructions/${id}.json`;
        await env.COORDINATOR_BUCKET.put(r2Key, changeDetail);

        const title = `Code change: ${change_type} on ${file_path}`;
        const contentText =
          description || `Direct ${change_type} on ${file_path}`;

        await env.COORDINATOR_DB.prepare(
          `INSERT INTO instructions (id, title, content, detail_ref, type, priority, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'direct_change', 'high', 'pending', ?, ?)`,
        )
          .bind(id, title, contentText, r2Key, ts, ts)
          .run();

        return {
          content: [
            {
              type: "text",
              text: `✅ Code change instruction created: [${id}] ${title}`,
            },
          ],
        };
      },
    );

    // --- update_workflow_docs ---
    this.server.tool(
      "update_workflow_docs",
      "Create or update a workflow/documentation file in R2",
      {
        doc_name: z
          .string()
          .describe("Document name, e.g. 'workflow-rules' or 'project-status'"),
        content: z.string().describe("The markdown content"),
      },
      async ({ doc_name, content }) => {
        const env = this.env as Env;
        const r2Key = `projects/${PROJECT_ID}/docs/${doc_name}.md`;
        await env.COORDINATOR_BUCKET.put(r2Key, content);
        return {
          content: [
            { type: "text", text: `✅ Document "${doc_name}.md" saved to R2.` },
          ],
        };
      },
    );

    // ============================================================
    // TOOLS FOR CLAUDE CODE (Implementor)
    // ============================================================

    // --- get_pending_instructions ---
    this.server.tool(
      "get_pending_instructions",
      "Get pending instructions and mark them as in_progress. For Claude Code use.",
      {},
      async () => {
        const env = this.env as Env;
        const ts = now();

        const results = await env.COORDINATOR_DB.prepare(
          "SELECT id, title, content, detail_ref, type, priority FROM instructions WHERE status = 'pending' ORDER BY CASE priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'normal' THEN 3 WHEN 'low' THEN 4 END, created_at ASC LIMIT 10",
        ).all();

        const rows = results.results || [];

        if (rows.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: "✅ No pending instructions. All caught up!",
              },
            ],
          };
        }

        for (const row of rows as any[]) {
          await env.COORDINATOR_DB.prepare(
            "UPDATE instructions SET status = 'in_progress', updated_at = ? WHERE id = ?",
          )
            .bind(ts, row.id)
            .run();
        }

        const enriched = [];
        for (const row of rows as any[]) {
          let detail = "";
          if (row.detail_ref) {
            const obj = await env.COORDINATOR_BUCKET.get(row.detail_ref);
            if (obj) {
              detail = "\n  Detail: " + (await obj.text()).slice(0, 500);
            }
          }
          enriched.push(
            `[${row.id}] ${row.priority.toUpperCase()} | ${row.type}\n  Title: ${row.title}\n  Content: ${row.content}${detail}`,
          );
        }

        return {
          content: [
            {
              type: "text",
              text: `📥 ${rows.length} pending instruction(s) picked up (now in_progress):\n\n${enriched.join("\n\n")}`,
            },
          ],
        };
      },
    );

    // --- submit_progress ---
    this.server.tool(
      "submit_progress",
      "Submit a progress report for an instruction. For Claude Code use.",
      {
        instruction_id: z
          .string()
          .describe("The instruction ID this report is for"),
        status: z.enum(["in_progress", "completed", "blocked"]),
        summary: z.string().describe("Short summary of progress"),
        details: z.string().optional().describe("Detailed progress notes"),
      },
      async ({ instruction_id, status, summary, details }) => {
        const env = this.env as Env;
        const id = genId();
        const ts = now();

        await env.COORDINATOR_DB.prepare(
          `INSERT INTO progress_reports (id, instruction_id, status, summary, details, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
          .bind(id, instruction_id, status, summary, details || null, ts)
          .run();

        if (status === "completed") {
          await env.COORDINATOR_DB.prepare(
            "UPDATE instructions SET status = 'completed', updated_at = ? WHERE id = ?",
          )
            .bind(ts, instruction_id)
            .run();
        }

        return {
          content: [
            {
              type: "text",
              text: `✅ Progress report [${id}] submitted for instruction [${instruction_id}] (status: ${status})`,
            },
          ],
        };
      },
    );

    // --- sync_files ---
    this.server.tool(
      "sync_files",
      "Sync one or more project files to R2. For Claude Code use.",
      {
        files: z
          .array(
            z.object({
              path: z
                .string()
                .describe("Relative file path, e.g. 'src/index.ts'"),
              content: z.string().describe("File content"),
            }),
          )
          .describe("Array of files to sync"),
      },
      async ({ files }) => {
        const env = this.env as Env;
        const ts = now();
        const synced: string[] = [];

        for (const file of files) {
          const r2Key = `projects/${PROJECT_ID}/files/${file.path}`;
          const size = new TextEncoder().encode(file.content).length;

          await env.COORDINATOR_BUCKET.put(r2Key, file.content);

          await env.COORDINATOR_DB.prepare(
            `INSERT INTO project_files (id, file_path, r2_key, size_bytes, synced_at)
             VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(file_path) DO UPDATE SET r2_key = ?, size_bytes = ?, synced_at = ?`,
          )
            .bind(genId(), file.path, r2Key, size, ts, r2Key, size, ts)
            .run();

          synced.push(`${file.path} (${size} bytes)`);
        }

        return {
          content: [
            {
              type: "text",
              text: `✅ ${synced.length} file(s) synced:\n${synced.join("\n")}`,
            },
          ],
        };
      },
    );

    // --- sync_file_tree ---
    this.server.tool(
      "sync_file_tree",
      "Sync a complete file tree (list of paths with content). For Claude Code use.",
      {
        files: z.array(
          z.object({
            path: z.string(),
            content: z.string(),
          }),
        ),
      },
      async ({ files }) => {
        const env = this.env as Env;
        const ts = now();
        let totalSize = 0;
        let count = 0;

        for (const file of files) {
          if (
            file.path.includes("node_modules/") ||
            file.path.includes(".next/") ||
            file.path.includes(".git/") ||
            file.path.includes("dist/") ||
            file.path.startsWith(".")
          ) {
            continue;
          }

          const r2Key = `projects/${PROJECT_ID}/files/${file.path}`;
          const size = new TextEncoder().encode(file.content).length;
          totalSize += size;

          await env.COORDINATOR_BUCKET.put(r2Key, file.content);
          await env.COORDINATOR_DB.prepare(
            `INSERT INTO project_files (id, file_path, r2_key, size_bytes, synced_at)
             VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(file_path) DO UPDATE SET r2_key = ?, size_bytes = ?, synced_at = ?`,
          )
            .bind(genId(), file.path, r2Key, size, ts, r2Key, size, ts)
            .run();

          count++;
        }

        return {
          content: [
            {
              type: "text",
              text: `✅ File tree synced: ${count} files, ${totalSize} bytes total.`,
            },
          ],
        };
      },
    );

    // ============================================================
    // SHARED TOOLS
    // ============================================================

    // --- get_project_status ---
    this.server.tool(
      "get_project_status",
      "Get a summary of the project: instruction counts by status, file count, recent activity",
      {},
      async () => {
        const env = this.env as Env;

        const instrCounts = await env.COORDINATOR_DB.prepare(
          "SELECT status, COUNT(*) as count FROM instructions GROUP BY status",
        ).all();

        const fileCount = await env.COORDINATOR_DB.prepare(
          "SELECT COUNT(*) as count FROM project_files",
        ).first<{ count: number }>();

        const recentReports = await env.COORDINATOR_DB.prepare(
          "SELECT pr.summary, pr.status, pr.created_at, i.title FROM progress_reports pr LEFT JOIN instructions i ON pr.instruction_id = i.id ORDER BY pr.created_at DESC LIMIT 5",
        ).all();

        const statusMap: Record<string, number> = {};
        for (const row of (instrCounts.results || []) as any[]) {
          statusMap[row.status] = row.count;
        }

        const recentLines = ((recentReports.results || []) as any[]).map(
          (r) => `  - [${r.status}] ${r.title}: ${r.summary} (${r.created_at})`,
        );

        const summary = [
          "📊 Project Status:",
          `  Instructions: ${statusMap["pending"] || 0} pending, ${statusMap["in_progress"] || 0} in progress, ${statusMap["completed"] || 0} completed`,
          `  Synced Files: ${fileCount?.count || 0}`,
          recentLines.length > 0
            ? `\n  Recent Activity:\n${recentLines.join("\n")}`
            : "  No recent activity.",
        ].join("\n");

        return { content: [{ type: "text", text: summary }] };
      },
    );

    // --- search_history ---
    this.server.tool(
      "search_history",
      "Search through instructions and progress reports by keyword",
      {
        query: z.string().describe("Search keyword"),
      },
      async ({ query }) => {
        const env = this.env as Env;
        const q = `%${query}%`;

        const instrResults = await env.COORDINATOR_DB.prepare(
          "SELECT id, title, status, created_at FROM instructions WHERE title LIKE ? OR content LIKE ? LIMIT 10",
        )
          .bind(q, q)
          .all();

        const reportResults = await env.COORDINATOR_DB.prepare(
          "SELECT id, instruction_id, summary, created_at FROM progress_reports WHERE summary LIKE ? OR details LIKE ? LIMIT 10",
        )
          .bind(q, q)
          .all();

        const instrLines = ((instrResults.results || []) as any[]).map(
          (r) =>
            `  [Instruction ${r.id}] ${r.status} - ${r.title} (${r.created_at})`,
        );
        const reportLines = ((reportResults.results || []) as any[]).map(
          (r) =>
            `  [Report ${r.id}] for [${r.instruction_id}] - ${r.summary} (${r.created_at})`,
        );

        const total = instrLines.length + reportLines.length;
        if (total === 0) {
          return {
            content: [{ type: "text", text: `🔍 No results for "${query}"` }],
          };
        }

        return {
          content: [
            {
              type: "text",
              text: `🔍 Search results for "${query}" (${total} matches):\n\nInstructions:\n${instrLines.join("\n") || "  (none)"}\n\nReports:\n${reportLines.join("\n") || "  (none)"}`,
            },
          ],
        };
      },
    );
  }
}

// Export the OAuthProvider as the default export
// This wraps the entire Worker with OAuth authentication
export default new OAuthProvider({
  apiRoute: "/mcp",
  apiHandler: MyMCP.serve("/mcp"),
  defaultHandler: GitHubHandler,
  authorizeEndpoint: "/authorize",
  tokenEndpoint: "/token",
  clientRegistrationEndpoint: "/register",
});
