import { speechService } from "@/server/services";
import { speechWaveform } from "@/server/waveform-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { const { id } = await params; const stored = speechService.file(id); if (!stored) return Response.json({ error: "Speech clip not found." }, { status: 404 }); return Response.json({ id, samples: await speechWaveform(id, stored.path) }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Waveform could not be generated." }, { status: 400 }); }
}
