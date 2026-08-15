import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const testDirectory = mkdtempSync(join(tmpdir(), "dialoguelab-tts-")); process.env.DIALOGUELAB_DATA_DIR = testDirectory;
const fixturePath = join(testDirectory, "fixture.mp3");
execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=0.6", "-codec:a", "libmp3lame", fixturePath]);
const audio = readFileSync(fixturePath); const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = String(input);
  if (url.includes("elevenlabs.io/v1/text-to-speech")) return Response.json({ audio_base64: audio.toString("base64"), normalized_alignment: {
    characters: [..."Hello world"], character_start_times_seconds: [..."Hello world"].map((_, index) => index * 0.05), character_end_times_seconds: [..."Hello world"].map((_, index) => (index + 1) * 0.05),
  } });
  if (url.includes("api.minimax.io/v1/t2a_v2")) return Response.json({ data: { audio: audio.toString("hex"), status: 2 }, base_resp: { status_code: 0, status_msg: "success" } });
  if (url.includes("api.fish.audio/v1/tts")) {
    if (new Headers(init?.headers).get("model") !== "s2.1-pro-free") throw new Error("Fish TTS did not request the free model.");
    return new Response(audio, { headers: { "content-type": "audio/mpeg" } });
  }
  throw new Error(`Unexpected fetch in TTS verification: ${url}`);
};

try {
  const { credentialRepository, voiceRepository } = await import("../src/server/repositories"); const { speechService } = await import("../src/server/services");
  const { canonicalizeWords } = await import("../src/server/whisper");
  credentialRepository.set("elevenlabs", "test-elevenlabs-key"); credentialRepository.set("minimax", "test-minimax-key"); credentialRepository.set("fish", "test-fish-key");
  const eleven = voiceRepository.add({ id: crypto.randomUUID(), provider: "elevenlabs", providerVoiceId: "eleven-test", name: "Eleven Test", description: "", kind: "existing", createdAt: new Date().toISOString() });
  const minimax = voiceRepository.add({ id: crypto.randomUUID(), provider: "minimax", providerVoiceId: "minimax-test", name: "MiniMax Test", description: "", kind: "existing", createdAt: new Date().toISOString() });
  const fish = voiceRepository.add({ id: crypto.randomUUID(), provider: "fish", providerVoiceId: "fish-test", name: "Fish Test", description: "", kind: "existing", createdAt: new Date().toISOString() });
  const first = await speechService.generate({ voiceId: eleven.id, text: "Hello world", speed: "fast" });
  const second = await speechService.generate({ voiceId: minimax.id, text: "Testing MiniMax timing fallback.", speed: "normal" });
  const third = await speechService.generate({ voiceId: fish.id, text: "Testing Fish free TTS.", speed: "normal" });
  if (first.words.length !== 2 || second.words.length !== 4 || third.words.length !== 4 || first.timingSource !== "provider" || second.timingSource !== "estimated" || third.timingSource !== "estimated" || first.durationSeconds <= 0 || !speechService.file(first.id) || !speechService.file(third.id)) throw new Error("Generated speech metadata is incomplete.");
  const canonical = canonicalizeWords("Exact source text", [{ text: "exact", type: "word", startSeconds: 0, endSeconds: 0.2 }, { text: "source", type: "word", startSeconds: 0.2, endSeconds: 0.5 }, { text: "test", type: "word", startSeconds: 0.5, endSeconds: 0.8 }]);
  if (canonical.map((word) => word.text).join(" ") !== "Exact source text") throw new Error("Whisper timing normalization changed the source text.");
  const repaired = canonicalizeWords("Usually yes but never hardcode that If your ball moves", [{ text: "If", type: "word", startSeconds: 4.4, endSeconds: 4.7 }, { text: "your", type: "word", startSeconds: 4.7, endSeconds: 4.9 }, { text: "ball", type: "word", startSeconds: 4.9, endSeconds: 5.1 }, { text: "moves", type: "word", startSeconds: 5.1, endSeconds: 5.4 }], 5.4);
  if (repaired.length !== 10 || repaired[0].text !== "Usually" || repaired[0].startSeconds !== 0 || repaired[6].text !== "If" || repaired[6].startSeconds !== 4.4) throw new Error("Whisper timing normalization did not restore missing transcript words.");
  console.log(JSON.stringify({ clips: speechService.list().map(({ id, voiceName, provider, durationSeconds, words, audioUrl }) => ({ id, voiceName, provider, durationSeconds, wordCount: words.length, audioUrl })) }, null, 2));
} finally {
  globalThis.fetch = originalFetch; const databaseGlobal = globalThis as typeof globalThis & { __dialogueDb?: { close(): void } }; databaseGlobal.__dialogueDb?.close();
  rmSync(testDirectory, { recursive: true, force: true });
}
