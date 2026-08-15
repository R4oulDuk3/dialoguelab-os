import { execFile } from "node:child_process";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { dataDirectory } from "./database";

const execFileAsync = promisify(execFile); const waveformDirectory = join(dataDirectory, "waveforms");

export async function speechWaveform(id: string, audioPath: string, bars = 96): Promise<number[]> {
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error("Speech ID is invalid.");
  await mkdir(waveformDirectory, { recursive: true }); const cachePath = join(waveformDirectory, `${id}.json`);
  try { const cached = JSON.parse(await readFile(cachePath, "utf8")) as number[]; if (cached.length === bars && cached.every((value) => value >= 0 && value <= 1)) return cached; } catch { /* rebuild */ }
  const pcmPath = join(waveformDirectory, `${id}.pcm`);
  try {
    await execFileAsync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", audioPath, "-vn", "-ac", "1", "-ar", "8000", "-f", "s16le", pcmPath], { timeout: 60_000 });
    const pcm = await readFile(pcmPath); const sampleCount = Math.floor(pcm.length / 2); const values: number[] = [];
    for (let bar = 0; bar < bars; bar++) { const start = Math.floor(bar * sampleCount / bars); const end = Math.max(start + 1, Math.floor((bar + 1) * sampleCount / bars)); let peak = 0;
      for (let index = start; index < end; index++) peak = Math.max(peak, Math.abs(pcm.readInt16LE(index * 2)) / 32768); values.push(Number(peak.toFixed(4))); }
    const maximum = Math.max(.0001, ...values); const normalized = values.map((value) => Number((value / maximum).toFixed(4))); await writeFile(cachePath, JSON.stringify(normalized)); return normalized;
  } finally { await unlink(pcmPath).catch(() => undefined); }
}
