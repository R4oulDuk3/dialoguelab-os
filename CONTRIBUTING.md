# Contributing to Dialogue Lab

Thanks for helping improve Dialogue Lab. Before opening a large pull request, start a discussion or issue so the intended behavior and scope can be agreed on.

## Development setup

1. Install Node.js 22.13 or newer, `ffmpeg`, and `ffprobe`.
2. Run `npm ci`.
3. Run `npm run doctor` and `npm test`.
4. Start the app with `npm run dev` and open `http://127.0.0.1:3000`.

Use `DIALOGUELAB_DATA_DIR` to point development and MCP processes at a disposable data directory. Never commit provider keys, databases, uploaded media, generated voices, renders, or personal character assets.

## Pull requests

- Keep changes focused and explain user-visible behavior.
- Add or update tests for behavior changes.
- Run `npm test`, `npm run build`, and `npm run check:privacy` before submitting.
- Update documentation when setup, provider, MCP, or project workflows change.
- Confirm that generated and user-owned data is not included in the diff.

By contributing, you agree that your contributions are licensed under the repository's MIT License.
