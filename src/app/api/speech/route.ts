import type { GenerateSpeechInput } from "@/shared/contracts";
import { speechService } from "@/server/services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  try { return Response.json(speechService.list(new URL(request.url).searchParams.get("voiceId") || undefined)); }
  catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try { return Response.json(await speechService.generate(await request.json() as GenerateSpeechInput), { status: 201 }); }
  catch (error) { return failure(error); }
}
export async function DELETE(request: Request) {
  try { const id = new URL(request.url).searchParams.get("id"); if (!id) throw new Error("Speech clip ID is required."); await speechService.remove(id); return Response.json({ ok: true }); }
  catch (error) { return failure(error); }
}
function failure(error: unknown) { return Response.json({ error: error instanceof Error ? error.message : "Speech generation failed." }, { status: 400 }); }
