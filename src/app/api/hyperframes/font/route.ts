import { fontService } from "@/server/font-service";
import { readFile } from "node:fs/promises";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const family = new URL(request.url).searchParams.get("family"); const asset = family ? fontService.asset(family) : undefined;
  if (!asset) return Response.json({ error: "Font not found." }, { status: 404 });
  try { return new Response(await readFile(asset.path), { headers: { "content-type": asset.record.mimeType, "cache-control": "private, max-age=86400" } }); }
  catch { return Response.json({ error: "Font file is unavailable." }, { status: 404 }); }
}
