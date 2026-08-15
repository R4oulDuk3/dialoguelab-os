# DialogueLab Local

A local-first studio for character-led dialogue videos, with shared voice, character, media, and background libraries in the browser UI and MCP server.

> **Highly recommended:** use the Dialogue Lab app together with **Codex** or **Claude Code**. The app provides visual preview and precise manual editing, while the MCP-connected agent can author dialogue, manage synchronized clips, generate speech, revise projects, and start local renders. See [Set up the MCP server](docs/MCP_SETUP.md).

Reddit Story and Text Story formats are experimental and hidden from new-project creation. See the [roadmap](docs/ROADMAP.md).

New here? Follow [Getting started](docs/GETTING_STARTED.md) for provider setup, your first voice and character, and a first Dialogue project. Then follow [Set up the MCP server](docs/MCP_SETUP.md) to connect Codex or Claude Code.

## Run the app

Requirements: Node.js 22.13 or newer, plus `ffmpeg` and `ffprobe` on `PATH`.

```bash
npm ci
npm run doctor
npm run dev
```

Open `http://127.0.0.1:3000`. On first launch, connect ElevenLabs, MiniMax, or Fish Audio. The app verifies provider keys before saving them.

Local state is stored outside the repository in the operating system's application-data directory:

- Windows: `%APPDATA%\\DialogueLab`
- macOS: `~/Library/Application Support/DialogueLab`
- Linux: `$XDG_DATA_HOME/dialoguelab` or `~/.local/share/dialoguelab`

That private directory contains:

- `dialoguelab.sqlite` contains projects and their versioned editor state, provider settings, voices, local voice artwork, characters, character images, and per-image dimensions.
- `master.key` encrypts provider API keys with AES-256-GCM and is created with owner-only permissions where supported.
- `previews/` contains temporary audio previews created through MCP.
- `backgrounds/` contains managed copies of imported MP4, WebM, and MOV background videos; SQLite stores their searchable metadata.
- `background-thumbnails/` contains locally generated JPEG poster frames for the background library.
- `fonts/` contains user-imported WOFF2, WOFF, TTF, and OTF files used by both preview and render.
- `renders/<project-id>/` contains persistent project MP4s; job state and frozen project revisions live in SQLite.
- `audio/tts/` contains generated dialogue speech. SQLite stores the source voice, model, speed, duration, and subtitle timing words.
- `runtime/faster-whisper/` and `models/faster-whisper/` contain the optional isolated subtitle runtime and multilingual Whisper model.

Set `DIALOGUELAB_DATA_DIR` to keep this data somewhere else. Stop the app, then use `npm run data:backup -- --output <empty-directory>` to make a complete backup. The backup contains `master.key` and must be protected like a provider credential. Restore with `npm run data:restore -- --from <backup-directory> --force`; existing data is moved to a recoverable sibling directory first.

Project data, generated media, character artwork, credentials, logs, and internal UI captures are excluded from the public repository. Keep `DIALOGUELAB_DATA_DIR` outside the repository and run `npm run check:privacy` before committing or publishing. See [Privacy and local data](docs/PRIVACY.md).

## Dialogue projects

Open a project to work in the Characters, Background, Media, Script, Subtitles, and Inspector tabs. Each dialogue line chooses a character, pose, stage position, text, speech speed, subtitle visibility, and gap. Lines support drag reordering, keyboard-friendly move controls, duplication, per-line audio audition, a word-level transcript/timing correction editor, and batch generation for missing or all TTS with progress, stop-after-current, and failed-line retry. The Media tab imports reusable local images, videos, and audio, creates text overlays, and manages persistent visual/audio tracks. The Characters tab can also place independent pose clips at the playhead; overlapping dialogue and pose clips support multi-character scenes and pose changes at arbitrary times. Every accepted edit is saved to SQLite with a revision number and persistent undo/redo history.

The embedded HyperFrames Studio timeline has sequential Flow and absolute Manual modes. A Dialogue Clip keeps its character, speech, and captions synchronized as one compound clip. Manual mode moves or trims that group as a unit; the child roles cannot be detached independently. Generic media/text/pose clips support authored start, duration, source offset, track, visibility, lock state, canvas transform, split, volume, playback speed, mute, and loop. The Inspector edits exact timing, position, size, rotation, opacity, stacking, the full DialogueLab entrance/during/exit/combo motion catalog, transition-in, and caption animation. Position and size—or motion—can be applied across every line for the same character. Studio multi-selection, one-frame keyboard nudging, deletion, snapping, and canvas drag/resize all write through the same transactional project commands. Motion is compiled onto inner wrappers on one paused GSAP timeline, preserving HyperFrames clip lifecycle and seek parity between the player and local render.

Library deletion is reference-safe: voices, characters, poses, backgrounds, speech, and media that are still used by a project are retained with a repair instruction. A character voice change invalidates every old line clip for that character so stale audio cannot silently render, and legacy projects with missing character, pose, or background records show recoverable editor errors and cannot render until repaired.

Caption styles are project data rather than render-only options. Presets and advanced controls cover bundled offline fonts, user-imported local fonts, size, weight, transform, colors, outline, shadow, alignment, exact vertical position, caption switch interval, width, line height, and words per page. The local renderer stages all referenced media and fonts into an isolated HyperFrames composition and produces an H.264/AAC MP4 without requiring the web app to be online. Render jobs persist queued/running/completed/failed/cancelled state, progress, the source project revision, and retry history across navigation and app restarts.

## MCP server

The stdio MCP server exposes project creation and editing, provider setup, local and remote voice listing, voice linking/cloning/design, speech generation, local Whisper setup, character management, background and generic-media imports, authored tracks/items, dialogue linking, canvas transforms, timeline inspection, and local rendering. Project type is explicit, while versioned project state owns the assets, blocks, scenes, and authored/compiled tracks that both the user editor and AI modify through the same transactional command service. Dialogue is the supported public format. Reddit Story and Fake Text creation is blocked unless `DIALOGUELAB_ENABLE_EXPERIMENTAL_PROJECTS=1` is set.

Focused timeline tools include `set_project_timeline_mode`, `set_dialogue_timing`, `set_dialogue_caption_words`, `add_project_track`, `import_media_asset`, `add_media_to_project_timeline`, `add_text_to_project_timeline`, `add_character_pose_to_project_timeline`, `set_character_canvas_transform`, `set_project_element_motion`, `set_project_visual_transition`, `set_timeline_item_playback`, `split_timeline_item`, and `set_project_caption_animation`. `generate_dialogue_audio_batch` generates all or only missing line audio, reports per-line failures, and accepts failed line IDs for retry. `set_character_canvas_transform` accepts a line or same-character scope. `apply_project_edits` applies a batch atomically; revision preconditions prevent an AI from overwriting a newer user edit. `list_project_history`, `undo_project`, and `redo_project` expose the same persistent history used by the UI. `render_project` queues a frozen saved revision locally; `get_render_job`, `list_render_jobs`, `cancel_render_job`, `retry_render_job`, and `remove_render_job` manage it. `list_fonts`, `import_font`, and `remove_font` expose the offline font library, while `update_background` edits local background metadata.

Feature-parity classification: DialogueLab's separate AI script-generator screen is intentionally unnecessary because MCP can author and revise the same dialogue-line model directly. JSON project import is deferred to P3. Background music and sound effects are also intentionally deferred to P3.


Run it directly during development:

```bash
npm run mcp
```

Build the standalone npm executable with:

```bash
npm run build:mcp
```

The publishable package lives in `packages/dialoguelab-mcp`. Once it has been published to npm, users can register it without cloning this repository.

Codex on Windows:

```powershell
codex mcp add dialoguelab -- cmd.exe /d /c npx.cmd -y dialoguelab-mcp
```

Claude Code on Windows:

```powershell
claude mcp add --scope user --transport stdio dialoguelab -- cmd.exe /d /c npx.cmd -y dialoguelab-mcp
```

On macOS or Linux, replace the command after `--` with `npx -y dialoguelab-mcp`. Set `DIALOGUELAB_DATA_DIR` when the MCP process should share a particular Dialogue Lab installation. Codex Desktop, the Codex CLI, and the IDE extension share the same Codex MCP configuration.

Example repository-development MCP client configuration:

```json
{
  "mcpServers": {
    "dialoguelab": {
      "command": "npm",
      "args": ["run", "mcp", "--prefix", "C:/absolute/path/to/dialoguelab-local"]
    }
  }
}
```

The web app does not need to be running for MCP; both processes use the same SQLite database and service layer. SQLite WAL mode allows them to coexist.

Agents should call the exposed MCP tools directly. The server initialization instructions tell clients to read `get_project_summary`, use the latest revision for writes, prefer `apply_project_edits` for compound authoring, and poll render jobs. A one-off `.mjs` script is not the normal MCP interaction model; scripts are only appropriate when a user explicitly asks for repeatable automation.

### Dialogue Lab video skill

`skills/dialoguelab-video` is the reusable agent workflow for turning a topic, article, script, or brief into a Dialogue Lab project through MCP. It covers factual research, short-form dialogue structure, cast and background selection, atomic project authoring, linked Dialogue Clips, batch TTS, word-anchored b-roll, caption and character layout, validation, and render polling. The skill deliberately does not generate standalone HTML or helper scripts; Dialogue Lab remains the source of truth for project state and HyperFrames output.

Install the folder into a personal Codex skills directory or expose it through your agent's repository-level skill mechanism. The Dialogue Lab MCP server must be registered separately.

### Publishing the MCP package

Before public release, prepare the permanent GitHub owner, repository metadata, synchronized package versions, and MCP Registry file:

```bash
npm run release:prepare -- --owner YOUR_GITHUB_OWNER --repo dialoguelab --version 0.1.0
npm run check:release
```

Review and commit the generated metadata. Then publish in this order:

```bash
npm run pack:mcp
cd packages/dialoguelab-mcp
npm publish --access public
mcp-publisher login github
mcp-publisher publish
```

The MCP Registry stores discoverability metadata; npm stores the installable server. The Registry is currently preview, so its schema may still change.

## Voice-provider behavior

- ElevenLabs: links account voices, creates Instant Voice Clones, and turns Voice Design previews into saved provider voices.
- MiniMax: links system/custom voices, uploads and clones source audio, creates designed voices, and synthesizes with Speech 2.8 HD. Cloned or designed MiniMax voices must be used for TTS within seven days to remain available; the UI flags this state.
- Fish Audio: links public/account voices, creates instant voice clones, and synthesizes multilingual speech through the Fish Audio API.

TTS providers are responsible for audio generation. When the optional local subtitle engine is installed from the speech dialog (or with the MCP `install_subtitle_engine` tool), faster-whisper transcribes every generated clip with word timestamps so all providers share one timing format. The known source text is used as a transcription prompt, and exact source spelling is retained when the word counts align. If Whisper is unavailable or fails, the app falls back to provider-native timing and then deterministic estimated timing. Every speech clip records its timing source. The default multilingual model is `small`; set `DIALOGUELAB_WHISPER_MODEL` before installation to choose another faster-whisper model. `ffprobe` is required to measure generated audio.

Whisper can run through WebAssembly or WebGPU, but the browser-native engine is not the default yet. It still needs cross-platform validation for word timestamps, long audio, memory, and model-download behavior; see the roadmap. The current Python engine remains optional, local, and packaged with the MCP install resources.

## Verification

`npm test` runs type checking, repository privacy checks, database migration coverage, editor invariants, TTS provider adapters with local fixtures, and isolated MCP checks. `npm run verify:package-mcp` packs the npm artifact, installs it in a clean temporary consumer directory, and starts the installed MCP server. `npm run build` produces the production standalone Next.js output. CI runs these checks on Windows, macOS, and Linux.

Voice cloning requires explicit confirmation that the user owns the voice or has the speaker’s permission.
