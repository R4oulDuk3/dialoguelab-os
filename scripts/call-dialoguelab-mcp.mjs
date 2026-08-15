import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const [toolName, encodedInput = "{}"] = process.argv.slice(2);
if (!toolName) throw new Error("Usage: node scripts/call-dialoguelab-mcp.mjs <tool-name> '<json-input>'");
const inputJson = encodedInput.startsWith("base64:") ? Buffer.from(encodedInput.slice(7), "base64url").toString("utf8") : encodedInput;
const transport = new StdioClientTransport({ command: "npm.cmd", args: ["run", "mcp"], cwd: process.cwd(), stderr: "pipe" });
const client = new Client({ name: "dialoguelab-task-runner", version: "1.0.0" });
try {
  await client.connect(transport);
  const response = await client.callTool({ name: toolName, arguments: JSON.parse(inputJson) }, undefined, { timeout: 15 * 60_000 });
  if (response.isError) throw new Error(response.content?.find((item) => item.type === "text")?.text || `${toolName} failed.`);
  const text = response.content?.find((item) => item.type === "text")?.text;
  process.stdout.write(text || JSON.stringify(response.structuredContent || {}, null, 2));
} finally {
  await client.close();
}
