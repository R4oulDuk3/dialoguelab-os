import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { renderService } from "@/server/render-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const projectId = query.get("projectId"); const renderId = query.get("renderId");
  const file = projectId && renderId ? await renderService.output(projectId, renderId) : undefined;
  if (!file) return Response.json({ error: "Rendered video not found." }, { status: 404 });
  const common = { "accept-ranges": "bytes", "content-type": "video/mp4", "content-disposition": "inline", "cache-control": "private, max-age=3600" };
  const range = request.headers.get("range");
  if (!range) return stream(file.path, 0, file.size - 1, 200, { ...common, "content-length": String(file.size) });
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!match) return new Response(null, { status: 416, headers: { "content-range": `bytes */${file.size}` } });
  const start = match[1] ? Number(match[1]) : Math.max(0, file.size - Number(match[2]));
  const end = match[2] && match[1] ? Math.min(Number(match[2]), file.size - 1) : file.size - 1;
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start > end || start >= file.size)
    return new Response(null, { status: 416, headers: { "content-range": `bytes */${file.size}` } });
  return stream(file.path, start, end, 206, { ...common, "content-length": String(end - start + 1), "content-range": `bytes ${start}-${end}/${file.size}` });
}

function stream(path: string, start: number, end: number, status: number, headers: Record<string, string>) {
  return new Response(Readable.toWeb(createReadStream(path, { start, end })) as unknown as ReadableStream, { status, headers });
}
