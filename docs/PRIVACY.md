# Privacy and local data

Dialogue Lab projects are local files and must never be committed to the source repository.

## What stays on this computer

By default, the app and packaged MCP server share the operating system's private application-data directory:

- Windows: `%APPDATA%\\DialogueLab`
- macOS: `~/Library/Application Support/DialogueLab`
- Linux: `$XDG_DATA_HOME/dialoguelab` or `~/.local/share/dialoguelab`

This includes:

- the SQLite project database;
- the `master.key` used to encrypt stored provider credentials;
- uploaded media, backgrounds, fonts, and character artwork;
- generated speech, subtitle models, previews, and rendered videos.

The repository ignores this directory as well as local `assets/`, `tmp/`, internal UI captures, environment files, SQLite sidecar files, and private key formats. Run `npm run check:privacy` before every public commit or release. The check inspects both tracked files and untracked files that Git would publish.

`DIALOGUELAB_DATA_DIR` may point somewhere else. Keep that directory outside the repository. Stop the app before running `npm run data:backup -- --output <empty-directory>`. A complete backup includes `dialoguelab.sqlite`, its media, and `master.key`; encrypted provider credentials cannot be recovered without the key. Store backups securely.

## What is sent to cloud providers

Dialogue Lab requires at least one supported cloud voice provider. Depending on the action, the selected provider receives:

- the provider API key for authentication;
- dialogue text submitted for speech generation or voice design;
- source audio submitted for voice cloning;
- generated audio submitted for cloud speech-to-text when ElevenLabs Scribe is selected.

Local character images, project files, backgrounds, and renders are not sent to a voice provider by the normal TTS flow. Local faster-whisper transcription runs on this computer.

Only clone a voice when the speaker has authorized its use. Review the selected provider's privacy, retention, and billing terms before connecting it.
