# Getting started

Dialogue Lab currently focuses on character-led Dialogue projects. A supported cloud voice provider is required for speech generation.

## 1. Install the local app

Requirements:

- Node.js 22.13 or newer;
- `ffmpeg` and `ffprobe` on `PATH` for audio inspection, media import, thumbnails, and rendering;
- Python only when using the current optional local faster-whisper subtitle engine.

From the repository root:

```bash
npm ci
npm run dev
```

Open `http://127.0.0.1:3000`.

## 2. Connect a voice provider

The first-run Get Started screen requires at least one provider:

- ElevenLabs;
- MiniMax;
- Fish Audio.

Use the “Where do I find my key?” link beside a provider to open its official API-key page. Dialogue Lab validates the key before encrypting and storing it locally. It never returns the full key to the browser or MCP client.

After connection, Dialogue Lab opens the Voice Library.

## 3. Add a voice

Start by linking an existing voice from the connected provider. Voice cloning and Voice Design are optional advanced flows. Only clone a voice when the speaker has authorized its use.

Speech generation runs on the selected provider's servers. See [Privacy and local data](PRIVACY.md) before submitting confidential text or source audio.

## 4. Create a character

A character combines one local voice with one or more visual poses. Add a name, select the voice, and upload pose images. Transparent PNG or WebP images with consistent canvas dimensions work best.

Character artwork is user data. It is stored locally and excluded from the source repository.

## 5. Create a Dialogue project

Create a project, choose its canvas, then:

1. Add characters to the cast.
2. Choose a background.
3. Add dialogue lines and assign each line a character and pose.
4. Generate missing speech.
5. Review captions and timing.
6. Render the project locally.

A Dialogue Clip keeps character visibility, generated speech, and captions synchronized. Flow mode places clips sequentially; Manual mode moves or trims each complete Dialogue Clip as one group.

## 6. Connect the development MCP server

The web app does not need to be running while MCP edits projects. The app and packaged MCP server now use the same operating-system data directory by default:

- Windows: `%APPDATA%\\DialogueLab`
- macOS: `~/Library/Application Support/DialogueLab`
- Linux: `$XDG_DATA_HOME/dialoguelab` or `~/.local/share/dialoguelab`

Set `DIALOGUELAB_DATA_DIR` on both processes when you want a different location, such as a disposable development profile.

Example client configuration for a repository checkout:

```json
{
  "mcpServers": {
    "dialoguelab": {
      "command": "npm",
      "args": ["run", "mcp", "--prefix", "C:/absolute/path/to/dialoguelab"]
    }
  }
}
```

Restart the MCP client after registering the server, then ask it to call `get_app_status` and `list_projects`.
