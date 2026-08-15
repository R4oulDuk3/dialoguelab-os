---
name: dialoguelab-video
description: Create, revise, voice, enrich with media, preview, and render short-form Dialogue Lab videos through the Dialogue Lab MCP server. Use for dialogue explainers, Peter/Stewie-style technical conversations, character-led social videos, captioned vertical clips, project edits, TTS regeneration, b-roll placement, or local HyperFrames renders. Also use when converting a topic, article, script, or brief into a Dialogue Lab project.
---

# Dialogue Lab Video

Build through the Dialogue Lab MCP server. Let Dialogue Lab own its project model, compound dialogue clips, captions, media tracks, word timing, and HyperFrames render. Do not generate a helper `.mjs`, standalone HTML composition, or direct database mutation unless the user explicitly asks for reusable automation.

Read [references/short-form-dialogue.md](references/short-form-dialogue.md) before drafting a new short-form dialogue or making creative layout decisions.

## Decide the stopping point

- For script-only requests, research and return the script without creating a project.
- For project requests, create or edit the project and generate audio when provider access is ready.
- Add b-roll only when requested or when it materially clarifies the explanation.
- Call `render_project` only when the user explicitly asks for a rendered video.
- For an existing project, edit it in place. Do not recreate it to simplify the workflow.

## Use MCP directly

1. Confirm that the `dialoguelab` MCP server is available. If unavailable, explain how to register it and stop; do not replace MCP calls with repository scripts.
2. Start with `get_app_status`, then call only the relevant inventory tools: `list_projects`, `list_voices`, `list_characters`, `list_backgrounds`, `list_media_assets`, and `list_fonts`.
3. Resolve user-facing names to current IDs from those reads. Never hardcode local UUIDs, provider voice IDs, character image IDs, or background IDs in the skill.
4. Before every existing-project mutation, call `get_project_summary`. Pass its latest `revision` as `expectedRevision` on writes that accept it.
5. Prefer one `apply_project_edits` call for related changes. Refresh the summary after every mutation before issuing another revision-guarded write.

## Research and write

When factual claims or current topics are involved, find one primary source and verify all numbers, names, and mechanisms. Prefer official engineering posts, papers, specifications, or incident reports. Use web research rather than inventing details.

Choose one sharp angle instead of covering an entire topic. Draft a conversational drill:

`hook → mechanism → natural objection → deeper mechanism → limitation → resolution → reframe`

Keep each speaker beat focused on one concept. The questioning character must react specifically to the previous answer. Define unfamiliar terms by describing what the system actually does before naming the term.

Do not impersonate a real person or protected character unless the user has supplied/authorized the corresponding local character and voice assets. Treat names such as Peter and Stewie as requested Dialogue Lab library entries, not permission to clone a voice.

## Create a project

1. Call `create_project` with `projectType: "dialogue"`, `1080 × 1920`, and `30 fps` unless the user specifies another format.
2. A new Dialogue Lab project automatically selects a random available background. Preserve it unless the user asks for a specific background. If none is available, report that clearly or import one the user supplied.
3. Resolve the cast with `list_characters`. If a requested character is missing, do not silently substitute. Create it only when an authorized voice and suitable local image are available.
4. Use `apply_project_edits` to configure the cast and add all dialogue lines in one transaction. Supply each line's `characterId`, `characterImageId`, `text`, `position`, `speechSpeed`, `gapAfterSeconds`, and `hideSubtitles: false`.
5. Keep the timeline in Flow mode for ordinary dialogue. Use Manual only when the user asks for absolute placement or overlapping scenes.
6. Keep character, speech, and captions linked as one Dialogue Clip. Never desynchronize or independently move the derived roles.

## Apply the social-video format

Dialogue Lab defaults already match the intended baseline: centered captions near mid-frame and bottom-anchored characters at about three-eighths of player height.

For the FSP-inspired preset, apply these partial changes through `apply_project_edits`:

- `set-caption-style`: centered alignment, middle position, `verticalPositionPx: 960`, `maxWidthPercent: 86`, `wordsPerPage: 4`, `switchCaptionsEveryMs: 800`, white text, green active word, black outline, uppercase.
- `set-caption-animation`: `preset: "pop"`, `durationSeconds: 0.18`.
- Use `set_character_canvas_transform` with `scope: "character"` only if a cast asset needs correction. Target `heightPercent: 37.5`, `yPercent: 80`, and `xPercent: 25` for left or `75` for right. Preserve aspect ratio by changing width and height together when necessary.

Do not force Peter and Stewie to equal visual height if their artwork has intentionally different proportions. Judge the visible subject, not the transparent image bounds.

## Generate and verify speech

1. Call `generate_dialogue_audio_batch` with `mode: "missing"`.
2. Inspect every failed line. Retry only failed `lineIds` after correcting the actual problem.
3. Call `get_project_summary` and require `voicedLineCount === lineCount` before rendering.
4. Call `get_project_timeline` when exact word timings, performance cues, or media anchors are needed. Avoid it for ordinary project reads because its payload is large.
5. Use `set_dialogue_performance_cues` for pose/emotion changes during a line. Anchor cues to unique spoken words from the generated timing instead of arbitrary wall-clock guesses.

## Add b-roll and other media

1. Prefer an authoritative source's own diagrams or screenshots. Use real official assets for real products and people. Use image generation for clean explanatory diagrams, not fake photoreal evidence.
2. Visually inspect every candidate asset before importing it.
3. Call `import_media_asset`, then place it through an authored visual track. For upper-third b-roll, start near `xPercent: 50`, `yPercent: 28`, `widthPercent: 88`, `heightPercent: 42`, and a z-index below captions and characters.
4. Resolve phrase anchors against word timings from `get_project_timeline`. Require each anchor phrase to match exactly once. Start visuals slightly before the spoken phrase when it helps comprehension.
5. If the proposed interval overlaps an item on its track, choose another compatible track or call `add_project_track` and place the item there. Never stack overlapping media clips on the same track.
6. Cover the opening hook end-to-end when using b-roll. For a roughly two-minute explainer, use about 8–12 meaningful visuals, not decoration on every line.
7. Mute looping video overlays unless their original sound is explicitly needed.

## Validate and render

Before rendering:

1. Call `get_project_summary` and resolve every error in `validationIssues`.
2. Confirm the project has a background, the intended cast, all dialogue lines, complete audio, visible captions, and no accidental media-track overlaps.
3. Check the script flow, factual claims, term introductions, closing reframe, and total duration.

When the user requested a render, call `render_project` once. Poll `get_render_job` until `completed`, `failed`, or `cancelled`. Do not start duplicate renders while a job is queued or running. Return the managed output path/URL and the frozen source revision. If it fails, report the render error and fix the project rather than bypassing Dialogue Lab with a separate HyperFrames composition.

## Edit safely

- Preserve unrelated user edits and existing media.
- Change dialogue text or character assignment only when intended; those edits invalidate stale audio by design.
- Use `undo_project` if an MCP edit produces an unwanted result.
- Keep full editor-state replacement through `update_project` as a last resort. Prefer focused commands and `apply_project_edits`.
- Never delete projects, characters, voices, backgrounds, media, or renders unless the user explicitly requests deletion.
