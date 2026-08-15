import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execute = promisify(execFile); const temporaryDirectory = await mkdtemp(path.join(tmpdir(), "dialoguelab-background-"));
const videoPath = path.join(temporaryDirectory, "mcp-test.mp4");
await execute("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "color=c=0x6d28d9:s=320x180:d=1", "-c:v", "libx264", "-pix_fmt", "yuv420p", videoPath]);
const transport = new StdioClientTransport({ command: process.execPath, args: ["--import", "tsx", "mcp/server.ts"], cwd: process.cwd(), stderr: "pipe" });
const client = new Client({ name: "dialoguelab-background-verification", version: "1.0.0" }); let backgroundId;
await client.connect(transport);
try {
  const tools = await client.listTools();
  const created = read(await client.callTool({ name: "add_background_video", arguments: { videoPath, name: "MCP verification", description: "Temporary test" } })).background;
  backgroundId = created.id;
  const updated = read(await client.callTool({ name: "update_background", arguments: { localBackgroundId: created.id, name: "MCP verification renamed", description: "Edited locally" } })).background;
  if (updated.name !== "MCP verification renamed" || updated.description !== "Edited locally" || !updated.thumbnailUrl) throw new Error("Background metadata or thumbnail URL was not updated correctly.");
  const listed = read(await client.callTool({ name: "list_backgrounds", arguments: { search: "MCP verification" } })).backgrounds;
  if (!listed.some((background) => background.id === created.id)) throw new Error("Created background was not returned by list_backgrounds.");
  console.log(JSON.stringify({ toolNames: tools.tools.map((tool) => tool.name).filter((name) => name.includes("background")), background: updated }, null, 2));
} finally {
  if (backgroundId) await client.callTool({ name: "remove_background", arguments: { localBackgroundId: backgroundId } });
  await client.close(); await rm(temporaryDirectory, { recursive: true, force: true });
}

function read(result) { return result.structuredContent ?? JSON.parse(result.content.find((item) => item.type === "text").text); }
