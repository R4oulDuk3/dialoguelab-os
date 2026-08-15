# Set up the Dialogue Lab MCP server

Dialogue Lab includes a local [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server. It gives an AI coding agent direct access to Dialogue Lab projects, characters, voices, captions, timelines, media, and local rendering.

> **Highly recommended:** use Dialogue Lab together with **Codex** or **Claude Code**. Keep the Dialogue Lab app open for visual preview and manual adjustments while the agent uses MCP to author, revise, validate, and render the same local projects. The app works by itself, but the combined workflow is the intended and most capable experience.

The MCP server uses stdio and runs as a local process. The web app does not technically need to be running while the agent edits a project, but both use the same private data directory by default.

## Before connecting

1. Install Node.js 22.13 or newer.
2. Install `ffmpeg` and `ffprobe` and make them available on `PATH`.
3. Start Dialogue Lab and connect at least one supported voice provider.
4. Add a voice and character in the app. This makes it much easier for an agent to create a complete first project.

Provider keys are configured in Dialogue Lab, not in the MCP client. The MCP server reads the same encrypted local provider configuration as the app.

## Option A: connect the published npm package

Use this option after `dialoguelab-mcp` is available on npm. `npx` downloads and starts the package automatically, so users do not need to clone this repository.

### Codex

macOS and Linux:

```bash
codex mcp add dialoguelab -- npx -y dialoguelab-mcp
```

Windows PowerShell or Command Prompt:

```powershell
codex mcp add dialoguelab -- cmd.exe /d /c npx.cmd -y dialoguelab-mcp
```

Confirm the configuration:

```bash
codex mcp list
```

Restart the current Codex client after adding the server. In Codex, use `/mcp` to confirm that `dialoguelab` is connected. Codex Desktop, the CLI, and the IDE extension share MCP configuration for the same Codex host. You can also add the server through **Settings → MCP servers → Add server** in clients that expose the graphical settings flow. See the [official Codex MCP guide](https://developers.openai.com/codex/mcp).

### Claude Code

macOS and Linux:

```bash
claude mcp add --transport stdio --scope user dialoguelab -- npx -y dialoguelab-mcp
```

Windows PowerShell or Command Prompt:

```powershell
claude mcp add --transport stdio --scope user dialoguelab -- cmd.exe /d /c npx.cmd -y dialoguelab-mcp
```

Confirm the configuration:

```bash
claude mcp list
```

Start or restart Claude Code, then use `/mcp` inside the session to inspect the connection. `--scope user` makes Dialogue Lab available across your projects. Omit it to use Claude Code's private, project-local default, or use `--scope project` only when you deliberately want to commit a shared `.mcp.json`. See the [official Claude Code MCP guide](https://code.claude.com/docs/en/mcp).

## Option B: connect from a repository checkout

Use this while developing Dialogue Lab or before the npm package is published.

From the Dialogue Lab repository:

```bash
npm ci
npm run build:mcp
```

Then register the generated executable with an absolute path.

Codex on Windows:

```powershell
codex mcp add dialoguelab -- node C:\absolute\path\to\dialoguelab\packages\dialoguelab-mcp\dist\cli.js
```

Codex on macOS or Linux:

```bash
codex mcp add dialoguelab -- node /absolute/path/to/dialoguelab/packages/dialoguelab-mcp/dist/cli.js
```

Claude Code on Windows:

```powershell
claude mcp add --transport stdio --scope user dialoguelab -- node C:\absolute\path\to\dialoguelab\packages\dialoguelab-mcp\dist\cli.js
```

Claude Code on macOS or Linux:

```bash
claude mcp add --transport stdio --scope user dialoguelab -- node /absolute/path/to/dialoguelab/packages/dialoguelab-mcp/dist/cli.js
```

Rebuild with `npm run build:mcp` after changing MCP or server code.

## Use a custom data directory

The app and MCP server automatically share the normal Dialogue Lab app-data directory. If the app is launched with `DIALOGUELAB_DATA_DIR`, pass the same absolute directory to the MCP server.

Codex example:

```bash
codex mcp add dialoguelab --env DIALOGUELAB_DATA_DIR=/absolute/private/dialoguelab-data -- npx -y dialoguelab-mcp
```

Claude Code example:

```bash
claude mcp add --transport stdio --scope user --env DIALOGUELAB_DATA_DIR=/absolute/private/dialoguelab-data dialoguelab -- npx -y dialoguelab-mcp
```

On Windows, keep the `cmd.exe /d /c npx.cmd ...` command shown above and use an absolute Windows path for the environment variable.

Never point `DIALOGUELAB_DATA_DIR` at the source repository. It contains the SQLite database, encrypted credentials, encryption key, uploaded artwork, generated audio, and renders.

## Verify the server

After restarting the client, ask the agent:

```text
Use the Dialogue Lab MCP server. Call get_app_status, then list_projects.
```

A healthy connection should return provider status and a project list without asking for a Dialogue Lab API key. You can then try:

```text
Inspect my Dialogue Lab voices, characters, and backgrounds. Do not change anything yet.
```

For a first authoring test:

```text
Create a short Dialogue Lab project using my existing characters. Show me the proposed dialogue before generating speech.
```

The agent should read project state before editing, use revision-aware MCP operations, and keep dialogue speech, captions, and character timing linked. Render operations are queued and may take longer than ordinary MCP calls.

## Recommended combined workflow

1. Use the app to connect providers and curate voices, characters, poses, and backgrounds.
2. Ask Codex or Claude Code to inspect those libraries through MCP.
3. Ask the agent to create or revise a project and generate missing speech.
4. Review the result visually in the Dialogue Lab app.
5. Make precise manual adjustments in the app or describe the revision to the agent.
6. Ask the agent to validate the project and start a local render.

The app and agent operate on the same project history. Revision checks prevent an agent from silently overwriting a newer edit made in the UI.

## Troubleshooting

### The server is not listed

- Run `codex mcp list` or `claude mcp list`.
- Restart the current desktop, CLI, or IDE session after adding the server.
- Make sure Node.js is on `PATH` for the process launching the client.
- On Windows, use `cmd.exe /d /c npx.cmd` for the published package.

### The server starts but tools are missing

- Open `/mcp` and inspect the server error.
- Remove and add the server again if its command or path changed.
- For a source checkout, rerun `npm run build:mcp`.
- Run `npm run verify:package-mcp` in the repository to test a clean packaged installation.

### The agent sees no projects or characters

The app and MCP process are probably using different data directories. Remove unnecessary overrides, or set the same absolute `DIALOGUELAB_DATA_DIR` for both.

### Voice generation fails

Open Dialogue Lab Settings and confirm that at least one voice provider is connected. Provider credentials belong in the app; do not paste keys into an agent prompt or commit them to an MCP configuration file.

### Rendering times out

Confirm that `ffmpeg` and `ffprobe` are on `PATH`. Rendering is asynchronous: the agent should call `render_project` once and poll `get_render_job` instead of repeatedly starting new renders.
