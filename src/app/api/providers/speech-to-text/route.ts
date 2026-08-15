import { assertSpeechToTextProvider, providerService } from "@/server/services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() { return Response.json(providerService.speechToTextStatus()); }

export async function PATCH(request: Request) {
  try {
    const { provider, model } = await request.json(); assertSpeechToTextProvider(provider);
    return Response.json(providerService.configureSpeechToText(provider, model));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not save speech-to-text settings." }, { status: 400 });
  }
}
