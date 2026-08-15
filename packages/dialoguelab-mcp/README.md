# Dialogue Lab MCP

Local-first MCP server for creating Dialogue Lab projects, characters, voices, subtitles, compound dialogue clips, media timelines, and HyperFrames MP4 renders.

## Requirements

- Node.js 22.13 or newer
- `ffmpeg` and `ffprobe` available on `PATH`
- A provider API key configured through Dialogue Lab for cloud TTS

The package includes the optional faster-whisper installer manifest and worker. Python is only needed if that local subtitle engine is installed; normal MCP startup does not require Python.

## Codex

macOS/Linux:

```bash
codex mcp add dialoguelab -- npx -y dialoguelab-mcp
```

Windows:

```powershell
codex mcp add dialoguelab -- cmd.exe /d /c npx.cmd -y dialoguelab-mcp
```

Restart Codex, then use `/mcp` or `codex mcp list` to verify the connection.

Codex Desktop, the Codex CLI, and the IDE extension use the same MCP configuration. A running Codex session must be restarted after adding the server so its tool list is refreshed.

For a repository-scoped Codex setup, commit this as `.codex/config.toml` in a trusted project (use `npx` directly on macOS/Linux):

```toml
[mcp_servers.dialoguelab]
command = "cmd.exe"
args = ["/d", "/c", "npx.cmd", "-y", "dialoguelab-mcp"]
startup_timeout_sec = 60
tool_timeout_sec = 3600
```

## Claude Code

macOS/Linux:

```bash
claude mcp add --scope user --transport stdio dialoguelab -- npx -y dialoguelab-mcp
```

Windows:

```powershell
claude mcp add --scope user --transport stdio dialoguelab -- cmd.exe /d /c npx.cmd -y dialoguelab-mcp
```

Use `--scope project` instead to create a shareable `.mcp.json` entry.

Equivalent Windows `.mcp.json`:

```json
{
  "mcpServers": {
    "dialoguelab": {
      "type": "stdio",
      "command": "cmd.exe",
      "args": ["/d", "/c", "npx.cmd", "-y", "dialoguelab-mcp"]
    }
  }
}
```

For a repository checkout before the npm package is published, run the built executable directly:

```powershell
codex mcp add dialoguelab --env DIALOGUELAB_DATA_DIR=C:\path\to\dialoguelab\data -- node C:\path\to\dialoguelab\packages\dialoguelab-mcp\dist\cli.js
```

## Data directory

By default, the server stores its encrypted provider credentials, SQLite database, local media, generated speech, and renders in the operating system's application-data directory:

- Windows: `%APPDATA%\DialogueLab`
- macOS: `~/Library/Application Support/DialogueLab`
- Linux: `$XDG_DATA_HOME/dialoguelab` or `~/.local/share/dialoguelab`

Override it with `DIALOGUELAB_DATA_DIR`. Point the MCP server and the Dialogue Lab desktop/web installation at the same directory when they should share projects and assets.

## Agent workflow

Read `get_project_summary` before editing. Prefer `apply_project_edits` for multi-step changes and pass the latest `expectedRevision`. Call `render_project` once, then poll `get_render_job`; do not generate wrapper scripts for interactive authoring.

## Publishing

This repository includes `server.json.example`, but it intentionally does not claim an MCP Registry namespace. Before publishing:

1. Choose the permanent GitHub organization or username and repository URL.
2. From the repository root, run `npm run release:prepare -- --owner OWNER --repo dialoguelab --version 0.1.0`.
3. Review the generated package metadata and `server.json`, then run `npm run check:release`.
4. Build and publish this npm package.
5. Run `mcp-publisher login github`, then `mcp-publisher publish`.

The MCP Registry contains metadata only; installation artifacts are served by npm.
