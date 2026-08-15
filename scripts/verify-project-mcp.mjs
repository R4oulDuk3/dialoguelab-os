import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({ command: "npm.cmd", args: ["run", "mcp"], cwd: process.cwd(), stderr: "pipe" });
const client = new Client({ name: "project-verifier", version: "1.0.0" });
try {
  await client.connect(transport); const tools = await client.listTools(); const names = tools.tools.map((tool) => tool.name);
  const expected = ["list_projects", "get_project", "get_project_summary", "get_project_timeline", "create_project", "update_project", "remove_project", "configure_project_stage", "add_dialogue_line", "update_dialogue_line", "duplicate_dialogue_line", "reorder_dialogue_lines", "remove_dialogue_line", "generate_dialogue_line_audio", "generate_dialogue_audio_batch", "set_project_caption_style", "set_dialogue_caption_words", "set_dialogue_performance_cues", "list_project_history", "undo_project", "redo_project", "apply_project_edits", "render_project", "list_media_assets", "import_media_asset", "set_project_timeline_mode", "set_dialogue_timing", "add_project_track", "add_media_to_project_timeline", "add_text_to_project_timeline", "set_dialogue_role_linked", "set_character_canvas_transform", "add_character_pose_to_project_timeline", "set_project_element_motion", "set_project_visual_transition", "set_timeline_item_playback", "split_timeline_item", "set_project_caption_animation"];
  for (const name of expected) if (!names.includes(name)) throw new Error(`Missing MCP tool: ${name}`);
  const listed = await client.callTool({ name: "list_projects", arguments: {} }); if (listed.isError) throw new Error(listed.content[0]?.text || "Could not list projects.");
  console.log(JSON.stringify({ toolNames: expected, listProjectsReady: true }, null, 2));
} finally { await client.close(); }
