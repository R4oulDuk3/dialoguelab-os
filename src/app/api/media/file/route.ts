import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { mediaService } from "@/server/services";

export const runtime = "nodejs";
export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id"); const file = id ? mediaService.file(id) : undefined;
  if (!file) return Response.json({ error: "Media not found." }, { status: 404 });
  let size: number; try { size = (await stat(file.path)).size; } catch { return Response.json({ error: "The local media file is missing." }, { status: 404 }); }
  const headers = { "accept-ranges": "bytes", "content-type": file.record.mimeType, "cache-control": "private, max-age=3600" }; const range = request.headers.get("range");
  if (!range) return stream(file.path, 0, size - 1, 200, { ...headers, "content-length": String(size) });
  const match = /^bytes=(\d*)-(\d*)$/.exec(range); if (!match) return new Response(null, { status: 416, headers: { "content-range": `bytes */${size}` } });
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2])); const end = match[2] && match[1] ? Math.min(Number(match[2]), size - 1) : size - 1;
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start > end || start >= size) return new Response(null, { status: 416, headers: { "content-range": `bytes */${size}` } });
  return stream(file.path, start, end, 206, { ...headers, "content-length": String(end - start + 1), "content-range": `bytes ${start}-${end}/${size}` });
}
function stream(path: string, start: number, end: number, status: number, headers: Record<string, string>) { return new Response(Readable.toWeb(createReadStream(path, { start, end })) as unknown as ReadableStream, { status, headers }); }
