import type { SpeechWord } from "./contracts";

export function alignTranscriptWords(text: string, words: SpeechWord[], durationSeconds?: number): SpeechWord[] {
  const source = text.match(/\S+/g) ?? [];
  const timed = words.filter((word) => word.type !== "spacing" && word.text && Number.isFinite(word.startSeconds) && Number.isFinite(word.endSeconds));
  if (!source.length) return [];
  const duration = Math.max(.001, durationSeconds ?? 0, ...timed.map((word) => word.endSeconds));
  if (!timed.length) return distributeWords(source, 0, duration);
  if (source.length === timed.length) return source.map((token, index) => ({ ...timed[index], text: token, type: "word" }));

  const sourceKeys = source.map(normalizeWord); const timedKeys = timed.map((word) => normalizeWord(word.text));
  const matches = longestCommonWordSequence(sourceKeys, timedKeys);
  if (!matches.length || matches.length / timed.length < .5 || (timed.length > 1 && matches.length < 2)) return distributeWords(source, 0, duration);

  const result = new Array<SpeechWord | undefined>(source.length);
  for (const [sourceIndex, timedIndex] of matches) {
    const word = timed[timedIndex];
    result[sourceIndex] = { ...word, text: source[sourceIndex], type: "word", startSeconds: clamp(word.startSeconds, 0, duration), endSeconds: clamp(Math.max(word.startSeconds, word.endSeconds), 0, duration) };
  }
  for (let index = 0; index < result.length;) {
    if (result[index]) { index += 1; continue; }
    const startIndex = index; while (index < result.length && !result[index]) index += 1;
    const endIndex = index; const left = startIndex > 0 ? result[startIndex - 1]?.endSeconds ?? 0 : 0; const right = endIndex < result.length ? result[endIndex]?.startSeconds ?? duration : duration;
    const replacements = distributeWords(source.slice(startIndex, endIndex), left, Math.max(left, right));
    for (let offset = 0; offset < replacements.length; offset += 1) result[startIndex + offset] = replacements[offset];
  }
  return result as SpeechWord[];
}

function distributeWords(tokens: string[], startSeconds: number, endSeconds: number): SpeechWord[] {
  const weights = tokens.map((token) => Math.max(1, normalizeWord(token).length)); const total = weights.reduce((sum, weight) => sum + weight, 0); const duration = Math.max(0, endSeconds - startSeconds);
  let cursor = startSeconds; return tokens.map((token, index) => { const start = cursor; cursor += duration * weights[index] / Math.max(1, total); return { text: token, type: "word", startSeconds: start, endSeconds: index === tokens.length - 1 ? endSeconds : cursor }; });
}

function longestCommonWordSequence(source: string[], timed: string[]): Array<[number, number]> {
  const rows = Array.from({ length: source.length + 1 }, () => new Uint16Array(timed.length + 1));
  for (let sourceIndex = source.length - 1; sourceIndex >= 0; sourceIndex -= 1) for (let timedIndex = timed.length - 1; timedIndex >= 0; timedIndex -= 1) {
    rows[sourceIndex][timedIndex] = source[sourceIndex] && source[sourceIndex] === timed[timedIndex] ? rows[sourceIndex + 1][timedIndex + 1] + 1 : Math.max(rows[sourceIndex + 1][timedIndex], rows[sourceIndex][timedIndex + 1]);
  }
  const result: Array<[number, number]> = []; let sourceIndex = 0; let timedIndex = 0;
  while (sourceIndex < source.length && timedIndex < timed.length) {
    if (source[sourceIndex] && source[sourceIndex] === timed[timedIndex]) { result.push([sourceIndex, timedIndex]); sourceIndex += 1; timedIndex += 1; }
    else if (rows[sourceIndex + 1][timedIndex] >= rows[sourceIndex][timedIndex + 1]) sourceIndex += 1; else timedIndex += 1;
  }
  return result;
}

function normalizeWord(value: string): string { return value.normalize("NFKD").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ""); }
function clamp(value: number, minimum: number, maximum: number): number { return Math.max(minimum, Math.min(maximum, value)); }
