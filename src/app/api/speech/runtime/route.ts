import { speechService } from "@/server/services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const voiceId = new URL(request.url).searchParams.get("voiceId");
    if (!voiceId) throw new Error("Voice ID is required.");
    return Response.json(await speechService.runtime(voiceId));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not inspect the speech runtime." }, { status: 400 });
  }
}
