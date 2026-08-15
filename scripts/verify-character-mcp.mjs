import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["--import", "tsx", "mcp/server.ts"],
  cwd: process.cwd(),
  stderr: "pipe",
});
const client = new Client({ name: "codex-character-verification", version: "1.0.0" });
await client.connect(transport);

try {
  const tools = await client.listTools();
  const expected = ["list_voices", "list_characters", "create_character", "update_character", "remove_character"];
  for (const name of expected) if (!tools.tools.some((tool) => tool.name === name)) throw new Error(`Missing MCP tool: ${name}`);
  const voices = read(await client.callTool({ name: "list_voices", arguments: {} })).voices;
  const characters = read(await client.callTool({ name: "list_characters", arguments: {} })).characters;
  console.log(JSON.stringify({
    toolNames: expected,
    voiceCount: voices.length,
    characterCount: characters.length,
    dataChanged: false,
  }, null, 2));
} finally { await client.close(); }

function read(result) {
  return result.structuredContent ?? JSON.parse(result.content.find((item) => item.type === "text").text);
}
