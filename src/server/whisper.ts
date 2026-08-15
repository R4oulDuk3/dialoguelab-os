import { execFile } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import type { SpeechWord, SubtitleEngineStatus } from "@/shared/contracts";
import { alignTranscriptWords } from "@/shared/speech-timing";
import { dataDirectory } from "./database";

const execFileAsync = promisify(execFile);
const WHISPER_MODEL = process.env.DIALOGUELAB_WHISPER_MODEL || "small";
export const whisperRuntimePath = join(dataDirectory, "runtime", "faster-whisper");
export const whisperModelPath = join(dataDirectory, "models", "faster-whisper");
const completePath = join(whisperRuntimePath, ".complete.json");
const workerPath = process.env.DIALOGUELAB_WHISPER_WORKER || join(process.cwd(), "scripts", "whisper-worker.py");
const requirementsPath = process.env.DIALOGUELAB_WHISPER_REQUIREMENTS || join(process.cwd(), "requirements-whisper.txt");
const jobs = globalThis as typeof globalThis & { __whisperInstall?: { error?: string; task?: Promise<void> } };

export function whisperPython(): string {
  if (process.env.DIALOGUELAB_WHISPER_PYTHON) return process.env.DIALOGUELAB_WHISPER_PYTHON;
  return process.platform === "win32" ? join(whisperRuntimePath, "Scripts", "python.exe") : join(whisperRuntimePath, "bin", "python");
}

export function whisperStatus(): SubtitleEngineStatus {
  const job = jobs.__whisperInstall;
  return {
    state: job?.task ? "downloading" : job?.error ? "error" : existsSync(completePath) && existsSync(/*turbopackIgnore: true*/ whisperPython()) ? "ready" : "not-installed",
    engine: "faster-whisper",
    model: WHISPER_MODEL,
    runtimePath: whisperPython(),
    modelPath: whisperModelPath,
    error: job?.error,
  };
}

export function startWhisperInstall(): SubtitleEngineStatus {
  if (whisperStatus().state === "ready" || jobs.__whisperInstall?.task) return whisperStatus();
  const job: { error?: string; task?: Promise<void> } = {};
  jobs.__whisperInstall = job;
  job.task = install().catch((error) => { job.error = error instanceof Error ? error.message : String(error); }).finally(() => { job.task = undefined; });
  return whisperStatus();
}

async function install(): Promise<void> {
  mkdirSync(dirname(whisperRuntimePath), { recursive: true });
  mkdirSync(whisperModelPath, { recursive: true });
  if (!existsSync(/*turbopackIgnore: true*/ whisperPython()))
    await execFileAsync(process.env.DIALOGUELAB_SYSTEM_PYTHON || "python", ["-m", "venv", whisperRuntimePath], { timeout: 5 * 60_000 });
  await execFileAsync(whisperPython(), ["-m", "pip", "install", "--disable-pip-version-check", "-r", requirementsPath], { timeout: 20 * 60_000, maxBuffer: 8 * 1024 * 1024 });
  await execFileAsync(whisperPython(), [workerPath, "--prepare", "--model", WHISPER_MODEL, "--model-root", whisperModelPath], { timeout: 30 * 60_000, maxBuffer: 8 * 1024 * 1024 });
  writeFileSync(completePath, JSON.stringify({ engine: "faster-whisper", model: WHISPER_MODEL, installedAt: new Date().toISOString() }, null, 2));
}

export async function whisperWords(audioPath: string, text: string, language?: string, durationSeconds?: number): Promise<SpeechWord[] | undefined> {
  if (whisperStatus().state !== "ready") return undefined;
  const requestDirectory = join(dataDirectory, "temp", "whisper");
  await mkdir(requestDirectory, { recursive: true });
  const requestPath = join(requestDirectory, `${crypto.randomUUID()}.json`);
  const normalizedLanguage = language && /^[a-z]{2,3}$/i.test(language) ? language.toLowerCase() : undefined;
  await writeFile(requestPath, JSON.stringify({ audioPath, text, language: normalizedLanguage }), "utf8");
  try {
    const { stdout } = await execFileAsync(whisperPython(), [workerPath, "--request", requestPath, "--model", WHISPER_MODEL, "--model-root", whisperModelPath], { timeout: 10 * 60_000, maxBuffer: 8 * 1024 * 1024 });
    const line = stdout.trim().split(/\r?\n/).at(-1); if (!line) throw new Error("Whisper returned no output.");
    const output = JSON.parse(line) as { words?: Array<{ text: string; startSeconds: number; endSeconds: number }> };
    const words = (output.words ?? []).filter((word) => word.text && Number.isFinite(word.startSeconds) && Number.isFinite(word.endSeconds) && word.endSeconds >= word.startSeconds)
      .map((word) => ({ ...word, type: "word" as const }));
    return canonicalizeWords(text, words, durationSeconds);
  } finally { await unlink(requestPath).catch(() => undefined); }
}

export function canonicalizeWords(text: string, words: SpeechWord[], durationSeconds?: number): SpeechWord[] { return alignTranscriptWords(text, words, durationSeconds); }
