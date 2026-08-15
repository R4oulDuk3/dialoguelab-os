# Roadmap

This roadmap records work in progress and does not promise release dates.

## Current public focus

The first public release focuses on character-led Dialogue projects: provider setup, voices, characters and poses, backgrounds, dialogue editing, captions, media overlays, MCP authoring, and local rendering.

## Work in progress

### Reddit Story projects

The experimental editor and renderer remain in the codebase, but new Reddit Story creation is hidden from the public navigation and project picker. Before it returns, it needs a focused onboarding flow, neutral branding and attribution review, end-to-end tests, and user documentation.

### Text Story projects

The experimental text-message editor and renderer remain in the codebase, but new Text Story creation is hidden from the public navigation and project picker. Before it returns, it needs product naming and trademark review, stronger templates, end-to-end tests, and user documentation.

Existing local projects of either type remain readable so hiding unfinished creation paths never deletes user work.

### Browser-native local transcription

Investigate replacing the optional Python faster-whisper runtime with a packaged JavaScript engine using Whisper through WebAssembly or WebGPU. Acceptance criteria:

- word-level timestamps suitable for Dialogue Lab captions;
- multilingual support;
- no audio leaves the computer;
- the UI and MCP server use the same transcription implementation;
- deterministic source-text alignment and the current fallback behavior remain intact;
- model size, startup time, memory use, and browser support are acceptable on Windows, macOS, and Linux.

The Python implementation remains the fallback until the browser/JavaScript engine meets these criteria.

Upstream support exists today: [whisper.cpp ships browser WebAssembly examples](https://github.com/ggml-org/whisper.cpp/tree/master/examples/whisper.wasm), and [Transformers.js documents Whisper on WebGPU](https://huggingface.co/docs/transformers.js/guides/webgpu). It is not literally zero-download: the runtime can ship with the app, but a useful model still adds tens or hundreds of megabytes and needs a cache/update policy. This release therefore favors the tested timestamp path over making an unvalidated browser engine the default.
