import type { ProjectEditorState, SpeechClipRecord } from "../src/shared/contracts";
import { characterVisibleAt, compileDialogueTimeline, DEFAULT_CAPTION_STYLE, subtitlePageAt } from "../src/shared/project-timeline";

function expect(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const speech = (id: string, durationSeconds: number, text: string): SpeechClipRecord => ({
  id, voiceId: "voice-1", voiceName: "Narrator", provider: "elevenlabs", providerVoiceId: "remote-1", text,
  model: "test", speed: "normal", mimeType: "audio/mpeg", sizeBytes: 10, durationSeconds,
  words: [
    { text: "Hello", type: "word", startSeconds: 0, endSeconds: 0.45 },
    { text: " ", type: "spacing", startSeconds: 0.45, endSeconds: 0.5 },
    { text: "there", type: "word", startSeconds: 0.5, endSeconds: Math.min(durationSeconds, 1.1) },
  ],
  timingSource: "provider", audioUrl: `/api/speech/${id}/audio`, createdAt: new Date(0).toISOString(),
});

const state: ProjectEditorState = {
  schemaVersion: 4,
  projectType: "dialogue",
  canvas: { width: 1080, height: 1920, fps: 30 },
  assets: { backgroundId: "background-1", backgroundStartSeconds: 2, characterIds: ["character-a", "character-b"] },
  blocks: [
    { id: "line-a", kind: "dialogue-line", order: 0, data: { characterId: "character-a", characterImageId: "pose-a", text: "Hello there", position: "left", speechSpeed: "normal", speechClipId: "speech-a", gapAfterSeconds: 0.35, hideSubtitles: false } },
    { id: "line-b", kind: "dialogue-line", order: 1, data: { characterId: "character-b", characterImageId: "pose-b", text: "Hello there", position: "right", speechSpeed: "normal", speechClipId: "speech-b", gapAfterSeconds: 0, hideSubtitles: false } },
  ],
  captions: DEFAULT_CAPTION_STYLE, captionAnimation: { preset: "none", durationSeconds: .2 }, timeline: { mode: "flow", tracks: [], items: [] }, scenes: [], tracks: [],
};

const timeline = compileDialogueTimeline(state, [speech("speech-a", 1.25, "Hello there"), speech("speech-b", 2.1, "Hello there")], 30);
const first = timeline.segments[0]; const second = timeline.segments[1];
expect(first.durationSeconds === 1.25, "The exact speech duration must drive the first segment.");
expect(first.endSeconds === 1.25, "The character must end at the speech boundary.");
expect(second.startSeconds === 1.6, "The next line must start after speech plus the configured gap.");
expect(timeline.durationSeconds === 3.7, "A trailing gap must not extend the project.");
expect(characterVisibleAt(first, 1.249), "The character should remain visible before speech finishes.");
expect(!characterVisibleAt(first, 1.25), "The character must disappear at the exact speech end.");
for (const kind of ["character-image", "speech", "captions"]) {
  const clip = timeline.tracks.flatMap((track) => track.clips).find((item) => item.kind === kind && item.groupId === "line-a");
  expect(clip?.startSeconds === first.startSeconds && clip.durationSeconds === first.durationSeconds, `${kind} must share the speech interval.`);
}
const subtitle = subtitlePageAt(first.speech!.words, 0.7);
expect(subtitle?.words[subtitle.activeIndex]?.text === "there", "Subtitle highlighting must follow stored word timings.");

console.log(JSON.stringify({ durationSeconds: timeline.durationSeconds, segmentStarts: timeline.segments.map((segment) => segment.startSeconds), exactBoundaryVisibility: false, synchronizedTracks: true }, null, 2));
