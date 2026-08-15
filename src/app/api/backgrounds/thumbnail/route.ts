import { readFile } from "node:fs/promises";
import { backgroundService } from "@/server/services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id"); const path = id ? await backgroundService.thumbnail(id) : undefined;
  if (!path) return Response.json({ error: "Thumbnail not found." }, { status: 404 });
  return new Response(await readFile(path), { headers: { "content-type": "image/jpeg", "cache-control": "private, max-age=86400" } });
}
