import { subtitleEngineService } from "@/server/services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(subtitleEngineService.status());
}

export function POST() {
  try { return Response.json(subtitleEngineService.install(), { status: 202 }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Could not install local subtitles." }, { status: 400 }); }
}
