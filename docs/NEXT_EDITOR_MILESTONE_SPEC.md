# DialogueLab Local — M2 Precise Dialogue Editing

> Historical M2 baseline. The implemented editor now uses schema v7: Flow/Manual timing, authored tracks and media/text/character-pose items, per-role dialogue unlinking, drag line ordering and audio audition, word-level caption correction, precise caption timing/position, canvas transforms, entrance/during/exit motion with bulk apply, clip split and media playback controls, Studio multi-selection/keyboard editing, and matching MCP/HyperFrames render support. The v3 interfaces below remain as the original dialogue-contract rationale but are superseded by `src/shared/contracts.ts` and `src/shared/project-timeline.ts`. A separate AI script generator is intentionally replaced by MCP authoring; JSON import, background music, and SFX are deferred to P3.

Status: implementation-ready specification
Scope owner: local project editor, HyperFrames preview/render, SQLite persistence, MCP editing
Depends on: projects, local voices/TTS, characters, backgrounds, Whisper timing, HyperFrames preview, and local MP4 rendering

## 1. Outcome

M2 turns the existing end-to-end dialogue renderer into a precise, reversible editor.

A user or MCP client must be able to edit a project through the same canonical project model, see the result immediately in the HyperFrames player, and render an MP4 that matches the preview. Speech audio, character visibility, and captions remain synchronized as one dialogue-line group.

M2 is complete when a user can:

1. Select, seek, play, pause, reorder, duplicate, delete, and retime dialogue lines.
2. See background, character, speech, and caption timing in a synchronized timeline.
3. Change the project-wide subtitle design and see it update in the player.
4. Undo or redo edits made by either the UI or MCP.
5. Render locally from the UI or MCP with frame-consistent timing and subtitle styling.

## 2. Fixed product decisions

These are requirements, not implementation options:

- Next.js remains the local application shell.
- SQLite remains the source of persisted application state.
- HyperFrames remains the only preview and render composition engine.
- `ProjectEditorState` remains the canonical project document.
- Timeline tracks are derived from project blocks and media records; tracks are not a second independently editable source of truth.
- A dialogue line is an atomic synchronization group containing character visibility, speech, and captions.
- The UI and MCP call the same server-side command service.
- Preview and render compile the same project revision through the same composition compiler.
- All preview and render assets must resolve locally. Preview/render must not depend on a bucket or runtime network access.
- HyperFrames owns audio/video playback and seeking. Composition code must not use render-time clocks, unseeded randomness, or independent media timers.

## 3. Explicitly outside M2

The following remain deferred:

- Entrance, exit, and transition animation controls.
- Sound effects and background music.
- Per-line images, videos, stickers, B-roll, and other media overlays.
- Arbitrary trimming of generated speech.
- Moving character, speech, and caption clips independently.
- Freeform canvas dragging or resizing of characters.
- Per-word subtitle correction and per-line subtitle-style overrides.
- Multicam, nested scenes, keyframes, and effect tracks.
- Cloud rendering, collaboration, authentication, and sharing.

## 4. Editor layout

### 4.1 Header

The project header contains, from left to right:

- Back to Projects.
- Editable project name.
- Save state: `Saving…`, `Saved locally`, or `Save failed`.
- Undo button with `Ctrl/Cmd+Z` shortcut.
- Redo button with `Ctrl/Cmd+Shift+Z` and `Ctrl/Cmd+Y` shortcuts.
- Render Video button.

Render Video is disabled when there are no dialogue lines, any line lacks generated speech, a save is pending/failed, or project validation fails. The disabled state must explain the blocking reason.

### 4.2 Main workspace

Desktop layout:

- Left inspector: 400–440 px, vertically scrollable.
- Right preview: remaining width, centered HyperFrames player.
- Bottom timeline: full workspace width, collapsible.

The inspector has four tabs in this order:

1. Characters
2. Background
3. Script
4. Subtitles

This replaces the current combined Setup tab while preserving its behavior.

At widths below 900 px, the inspector and preview stack. The timeline remains full-width and horizontally scrollable.

### 4.3 Preview transport

The preview header displays:

- Play/pause.
- Current time and total duration as `mm:ss.s / mm:ss.s`.
- Previous-line and next-line controls.
- Player readiness or validation state.
- Canvas size and FPS.

The app wraps the HyperFrames player in an internal adapter with this contract:

```ts
interface ProjectPlayerAdapter {
  play(): void;
  pause(): void;
  seek(seconds: number): void;
  currentTime(): number;
  duration(): number;
  onTimeChange(listener: (seconds: number) => void): () => void;
  onPlaybackChange(listener: (playing: boolean) => void): () => void;
}
```

The adapter isolates editor code from custom-element implementation details. There is one playback clock: the HyperFrames player.

## 5. Script editing

### 5.1 Dialogue line card

Every line card contains:

- Line number.
- Character selector.
- Character pose selector.
- Position selector: Left, Center, Right.
- Dialogue text.
- Speech speed: Slow, Normal, Fast.
- Audio state and timing source.
- Generate or Regenerate Audio.
- Gap after line, in seconds.
- Hide subtitles toggle.
- Duplicate.
- Move up and Move down.
- Delete.

Selecting a card selects the corresponding timeline group and seeks to the line start. Selecting a timeline group scrolls and highlights the corresponding card.

### 5.2 Edit invalidation rules

Edits that invalidate `speechClipId` and require regeneration:

- Dialogue text changes.
- Character changes, because the assigned voice may change.
- Speech speed changes.
- Future language changes.

Edits that do not invalidate speech:

- Pose changes.
- Left/center/right position changes.
- Gap changes.
- Subtitle visibility changes.
- Reordering.
- Project-wide subtitle styling.

When an edit invalidates speech, the existing reusable speech clip remains in the speech library but is unlinked from the line.

### 5.3 Save behavior

- Selectors, buttons, toggles, and timing changes save immediately.
- Text input saves after 750 ms without typing or on blur.
- Consecutive text saves to the same line within two seconds coalesce into one undo entry.
- A failed save restores the last confirmed state and shows a non-destructive error.
- The client sends its expected project revision. A stale revision is rejected and reloaded rather than silently overwriting a newer UI or MCP edit.

### 5.4 Duplicate behavior

Duplicate inserts a new line immediately after the source line.

It copies character, pose, position, text, speed, gap, and subtitle visibility. It does not copy `speechClipId`; the duplicate begins in `Needs audio` state to avoid accidental reuse when the text is subsequently edited.

## 6. Timeline

### 6.1 Panel

The timeline is collapsed by default to a 44 px bar and expands to 260 px. Its toolbar contains:

- Expand/collapse.
- Current time.
- Zoom out.
- Zoom slider.
- Zoom in.
- Fit project.

Zoom range is 25%–400%. The timeline scrolls horizontally and keeps the playhead visible during playback unless the user is actively scrolling.

### 6.2 Tracks

Tracks appear in this fixed order:

| Order | Track | Behavior |
| --- | --- | --- |
| 1 | Background | Locked; spans the project duration; displays source offset |
| 2 | Characters | One visible clip per dialogue line |
| 3 | Speech | One audio clip and waveform per voiced dialogue line |
| 4 | Captions | One grouped clip per visible subtitle line |

The background track is omitted when no background is selected. Character, Speech, and Captions tracks always exist, including in empty-state form.

### 6.3 Dialogue groups

All clips with the same `groupId` belong to one dialogue line. The group starts at the line start and its duration equals the linked speech duration. If speech is missing, the estimated duration is displayed with a striped `Unvoiced estimate` state.

The group can be selected or reordered, but child clips cannot be independently moved or resized in M2.

### 6.4 Interactions

- Clicking the ruler seeks the player.
- Dragging the playhead scrubs the player.
- Clicking any grouped clip selects the entire dialogue line.
- Double-clicking a group seeks and focuses its script card.
- Dragging a group horizontally reorders it by crossing another group’s midpoint; it does not create arbitrary absolute start times.
- A gap handle after each group adjusts `gapAfterSeconds` from 0 to 10 seconds in 0.05-second increments.
- Holding Shift while dragging the gap handle uses 0.5-second increments.
- Arrow Left/Right seeks one frame when the timeline has focus.
- Shift+Arrow Left/Right seeks one second.
- Space toggles play/pause unless a text field has focus.
- Delete removes the selected line only after confirmation.

The current line is determined using `[startSeconds, endSeconds)`. At the exact end frame, character and captions for the previous line are absent.

### 6.5 Speech waveform

The speech track shows a lightweight amplitude waveform for orientation only. It is not an audio editor.

- Waveform samples are derived locally from the persisted audio file.
- Samples are cached by speech clip ID.
- The waveform never affects render data.
- Missing or unreadable waveform data falls back to a plain audio clip without blocking editing or rendering.

### 6.6 Background timing

The background clip displays the chosen source offset. The user may adjust the offset through the Background inspector or the background clip’s source-offset handle.

Changing the background offset does not change project duration. The existing background playback/loop behavior remains unchanged in M2.

## 7. Subtitle design

### 7.1 Scope

Subtitle style is project-wide in M2. It applies to every line unless that line has `hideSubtitles: true`.

The Subtitles tab contains a live preset gallery and advanced controls. Every change updates the HyperFrames preview without regenerating TTS or Whisper timing.

### 7.2 Presets

Initial bundled presets:

- Dialogue Bold: white heavy text, black outline, lime active word.
- Classic: white semibold text, black outline, no active-word color change.
- Minimal: white medium text with soft shadow and no outline.
- Karaoke: white text with purple active word and compact paging.

Choosing a preset writes its complete values into project state. Subsequent advanced changes do not mutate the preset definition.

### 7.3 Controls

The exact persisted caption configuration is:

```ts
interface ProjectCaptionStyle {
  presetId: "dialogue-bold" | "classic" | "minimal" | "karaoke" | "custom";
  fontFamily: "Inter" | "Montserrat" | "Anton" | "Poppins" | "Bebas Neue" | "Roboto Condensed";
  fontSizePx: number;          // 24–180
  fontWeight: 400 | 500 | 600 | 700 | 800 | 900;
  textTransform: "none" | "uppercase" | "lowercase" | "capitalize";
  textColor: string;          // #RRGGBB
  activeWordColor: string;    // #RRGGBB
  strokeColor: string;        // #RRGGBB
  strokeWidthPx: number;      // 0–24
  shadowEnabled: boolean;
  shadowColor: string;        // #RRGGBB
  shadowBlurPx: number;       // 0–40
  shadowOffsetX: number;      // -20–20
  shadowOffsetY: number;      // -20–20
  shadowOpacity: number;      // 0–1
  position: "top" | "middle" | "bottom";
  edgeOffsetPercent: number;  // 0–30
  maxWidthPercent: number;    // 40–96
  alignment: "left" | "center" | "right";
  wordsPerPage: number;       // 1–8
  lineHeight: number;         // 0.8–1.6
}
```

All six fonts are bundled or installed as application dependencies and must work offline. Arbitrary remote font URLs are not accepted.

### 7.4 Caption timing and paging

- Word timing comes from the linked `SpeechClipRecord`.
- Whisper timing is preferred, then provider timing, then estimated timing.
- `wordsPerPage` groups displayable words; spacing and punctuation attach to adjacent words and do not consume a word slot.
- A page starts with its first timed word and ends with its final timed word.
- The active word changes according to the word interval `[startSeconds, endSeconds)`.
- Captions disappear at speech end.
- Empty timing data produces a single full-line caption lasting for the speech duration.
- Subtitle layout respects the configured width and edge offset inside the video safe area.

## 8. Canonical project schema

`PROJECT_STATE_VERSION` advances from 2 to 3.

```ts
interface ProjectEditorStateV3 {
  schemaVersion: 3;
  canvas: { width: number; height: number; fps: number };
  assets: {
    backgroundId?: string;
    backgroundStartSeconds: number;
    characterIds: string[];
  };
  captions: ProjectCaptionStyle;
  blocks: ProjectBlock[];
  scenes: Array<Record<string, unknown>>;
  tracks: ProjectTrack[]; // compiled cache only
}

interface DialogueLineDataV3 {
  characterId: string;
  characterImageId: string;
  text: string;
  position: "left" | "center" | "right";
  speechSpeed: "slow" | "normal" | "fast";
  speechClipId?: string;
  gapAfterSeconds: number;
  hideSubtitles: boolean;
}
```

Migration from v2:

- Add the Dialogue Bold default caption style.
- Set missing `speechSpeed` to `fast` to preserve existing behavior.
- Set missing `hideSubtitles` to `false`.
- Preserve all IDs, speech links, block order, canvas values, and asset selections.
- Recompile tracks rather than trusting persisted v2 track timing.

The persisted `tracks` array remains a cache for inspection and MCP responses. `compileDialogueTimeline()` always derives it again from blocks, media, and caption configuration before preview or render.

## 9. Command and history system

### 9.1 One mutation path

All project edits are commands handled by `projectCommandService`. UI API routes and MCP tools cannot write `editor_state_json` directly.

Supported command kinds:

- `configure-stage`
- `add-dialogue-line`
- `update-dialogue-line`
- `duplicate-dialogue-line`
- `remove-dialogue-line`
- `reorder-dialogue-lines`
- `set-dialogue-gap`
- `set-caption-style`
- `undo`
- `redo`

Every command validates references, applies atomically, recompiles tracks, increments the project revision, stores history, and returns the updated project plus compiled timeline.

### 9.2 SQLite changes

Add `revision INTEGER NOT NULL DEFAULT 0` and `history_cursor INTEGER NOT NULL DEFAULT 0` to `projects`.

Add:

```sql
CREATE TABLE project_history (
  project_id TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  revision INTEGER NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('ui', 'mcp', 'system')),
  command_kind TEXT NOT NULL,
  summary TEXT NOT NULL,
  editor_state_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (project_id, sequence),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
```

Rules:

- New projects receive history sequence 0 containing their initial state.
- A successful edit appends one snapshot and advances the cursor.
- Undo moves the cursor back and restores that snapshot.
- Redo moves the cursor forward and restores that snapshot.
- A new edit after undo removes the unreachable redo branch before appending.
- Retain the latest 100 reachable snapshots per project.
- Render does not create a history entry.
- Audio generation creates history only when the generated clip is linked to a line.

### 9.3 Optimistic concurrency

Mutation commands accept `expectedRevision`.

- Matching revision: apply command.
- Missing revision: apply to latest state and return the resulting revision; this is primarily for simple MCP use.
- Stale revision: return a structured conflict containing the current revision and no partial changes.
- Bulk commands validate fully and either commit all edits or commit none.

## 10. MCP additions

Existing project, stage, line, audio, and render tools remain compatible. Add:

### `get_project_timeline`

Read-only. Input: `localProjectId`.

Returns project revision, duration, ordered dialogue segments, derived tracks, audio readiness, caption style, and validation issues.

### `duplicate_dialogue_line`

Input: `localProjectId`, `lineId`, optional `expectedRevision`.

Returns the new line ID, updated project revision, and compiled timing.

### `reorder_dialogue_lines`

Input: `localProjectId`, complete ordered array of dialogue line IDs, optional `expectedRevision`.

Rejects missing, duplicate, or foreign IDs. Reordering is atomic.

### `set_project_caption_style`

Input: `localProjectId`, partial caption style, optional `expectedRevision`.

Validates ranges and colors, merges into current style, changes `presetId` to `custom` when appropriate, and returns the effective complete style.

### `list_project_history`

Read-only. Input: `localProjectId`, optional limit up to 100.

Returns sequence, revision, source, command kind, summary, timestamp, and current cursor. It does not return every historical state body.

### `undo_project` and `redo_project`

Input: `localProjectId`, optional `expectedRevision`.

Returns the restored project, compiled timeline, revision, and whether another undo/redo is available.

### `apply_project_edits`

Input: `localProjectId`, optional `expectedRevision`, and 1–100 validated editor commands.

This is the preferred AI authoring tool. It applies a coherent multi-line change as one SQLite transaction and one undo step. Render and audio generation are excluded from the batch because they perform long-running media work.

Enhance `update_dialogue_line` to support `speechSpeed`, `gapAfterSeconds`, and `hideSubtitles`, while preserving the invalidation rules in section 5.2.

## 11. HTTP/client API additions

Add these application endpoints:

- `GET /api/projects/[id]/timeline`
- `POST /api/projects/[id]/commands`
- `GET /api/projects/[id]/history`
- `POST /api/projects/[id]/undo`
- `POST /api/projects/[id]/redo`
- `GET /api/speech/[id]/waveform`

All mutation responses return:

```ts
interface ProjectCommandResult {
  project: ProjectRecord;
  revision: number;
  timeline: CompiledDialogueTimeline;
  canUndo: boolean;
  canRedo: boolean;
}
```

Errors use structured codes: `VALIDATION_ERROR`, `REVISION_CONFLICT`, `NOT_FOUND`, `AUDIO_REQUIRED`, and `INTERNAL_ERROR`.

## 12. HyperFrames composition contract

The generated composition must:

- Use one explicitly sized root with project width, height, FPS, and duration.
- Register exactly one paused timeline under the composition ID.
- Give every assembled DOM element a unique ID.
- Use framework-controlled `.clip` visibility.
- Use local URLs/files for background, character images, speech audio, and fonts.
- Give every character clip the exact line start and speech duration.
- Give speech audio the exact same start and duration.
- Derive caption page clips from the same word timing.
- Keep the background on its own lowest visual track.
- Avoid network fetches, render-time clocks, random values, and independent media playback code.
- Apply caption CSS only from validated `ProjectCaptionStyle` values.

Stable composition track indexes:

- 0: background
- 1: character visuals
- 2: captions
- Audio is framework-owned media aligned to its dialogue group.

Changing a gap shifts every subsequent group and changes composition duration. Changing caption style never changes audio timing or composition duration.

## 13. Validation and render readiness

The editor and MCP expose the same validation result.

Blocking issues:

- No dialogue lines.
- Missing or deleted character/pose reference.
- Missing or deleted linked speech clip.
- Empty dialogue text.
- Invalid caption configuration.
- Invalid canvas size or FPS.

Warnings that do not block preview:

- No background.
- Missing speech, when displaying an estimated timeline before render.
- Estimated rather than Whisper/provider word timing.
- Missing waveform cache.

Rendering remains blocked until every line has speech. No silent estimated-audio render is allowed.

## 14. Accessibility and keyboard behavior

- Every icon-only control has an accessible label and tooltip.
- Timeline clips are keyboard-focusable and announce line number, character, start, and duration.
- Color controls display hex values and are not the only indicator of state.
- Selected, missing-audio, and validation states use text/icon indicators in addition to color.
- Focus is preserved after save, undo, redo, and regeneration.
- Reduced-motion preferences affect editor UI transitions but not authored video output.

## 15. Acceptance criteria

### Timing

- For a 30 FPS project, timeline, player, and rendered media agree within one frame at every dialogue boundary.
- A character appears at its line start and is absent at its end.
- Captions appear only during their word/page interval and are absent after speech ends.
- Changing a 0.35-second gap to 1.00 second shifts every later group by exactly 0.65 second.
- Reordering lines preserves each line’s linked speech and recomputes all later start times.

### Editing

- Script and timeline selection remain synchronized in both directions.
- Text, character, or speed edits unlink stale speech; visual/timing edits do not.
- Duplicate produces a new stable ID and no speech link.
- UI undo can reverse an MCP batch edit, and MCP undo can reverse a UI edit.
- Redo becomes unavailable after a new edit is made from an undone state.
- Revision conflicts never partially overwrite project state.

### Subtitles

- All four presets match preview and render.
- Every advanced control persists after reload.
- Hidden subtitles are absent from preview, render, and the compiled caption track.
- Fonts render offline.
- Punctuation and spacing do not incorrectly consume `wordsPerPage` slots.

### Render

- UI render and MCP render use the same saved revision.
- The rendered MP4 includes H.264 video and synchronized audio at the project canvas/FPS.
- Render output matches preview snapshots at the beginning, midpoint, line boundaries, and final frame.
- Preview and render continue to work with networking disabled after local dependencies/models are installed.

### Regression

- Existing projects migrate without losing cast, background, lines, poses, audio links, or order.
- Existing MCP tools remain callable.
- Voice, character, background, TTS, Whisper, project library, and rendering verification scripts continue to pass.

## 16. Required automated verification

Add or extend tests for:

- v2-to-v3 state migration.
- Timeline compilation and exact gap arithmetic.
- Caption word paging and active-word boundaries.
- Speech invalidation rules.
- Command transactions, history, undo, redo, and branch replacement.
- Revision conflict behavior.
- MCP tool schemas and a full MCP edit → undo → redo → render workflow.
- Composition validation for zero, one, and many dialogue lines.
- Projects with no background, one character, multiple characters, hidden subtitles, and missing audio.
- 24, 30, and 60 FPS boundary calculations.

Required completion gates:

1. TypeScript/Next.js checks pass.
2. Character, project, TTS, subtitle, HyperFrames player, render, and MCP verification pass.
3. HyperFrames composition validation passes.
4. A local reference project is edited through both UI and MCP.
5. The reference project is rendered and visually inspected with a multi-timestamp contact sheet.

## 17. Implementation order

1. Add v3 schema, migration, defaults, and caption configuration.
2. Add command service, SQLite history, revisions, and undo/redo.
3. Route existing UI and MCP mutations through the command service.
4. Add player adapter and shared selection/playhead state.
5. Build the timeline ruler, tracks, grouped clips, waveform display, and gap/reorder interactions.
6. Split the inspector into Characters, Background, Script, and Subtitles.
7. Add subtitle presets and advanced controls.
8. Update HyperFrames compilation to consume the v3 caption style.
9. Add MCP timeline, batch edit, history, undo, redo, reorder, duplicate, and caption tools.
10. Complete automated, offline, render, and visual verification.

No later step may create a separate timing or caption state outside `ProjectEditorStateV3` and its deterministic compiled timeline.
