import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({ command: process.execPath, args: ["--import", "tsx", "mcp/server.ts"], cwd: process.cwd(), stderr: "pipe" });
const client = new Client({ name: "dialoguelab-tts-mcp-verification", version: "1.0.0" }); await client.connect(transport);
try {
  const expected = ["list_speech_clips", "generate_speech", "remove_speech_clip", "get_subtitle_engine_status", "install_subtitle_engine"]; const tools = await client.listTools(); const names = tools.tools.map((tool) => tool.name);
  if (expected.some((name) => !names.includes(name))) throw new Error("One or more speech MCP tools are missing.");
  const listed = await client.callTool({ name: "list_speech_clips", arguments: {} }); if (listed.isError) throw new Error(listed.content[0]?.text || "Could not list speech clips.");
  const subtitleStatus = await client.callTool({ name: "get_subtitle_engine_status", arguments: {} }); if (subtitleStatus.isError) throw new Error(subtitleStatus.content[0]?.text || "Could not inspect subtitle status.");
  console.log(JSON.stringify({ toolNames: expected, currentClipCount: read(listed).clips.length }, null, 2));
} finally { await client.close(); }

function read(result) { return result.structuredContent ?? JSON.parse(result.content.find((item) => item.type === "text").text); }
