import { assertProvider, voiceService } from "@/server/services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try { const provider = new URL(request.url).searchParams.get("provider"); assertProvider(provider); return Response.json(await voiceService.listRemote(provider)); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Could not load voices." }, { status: 400 }); }
}
