import { assertProvider, assertSpeechToTextProvider, providerService } from "@/server/services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() { return Response.json(providerService.statuses()); }
export async function POST(request: Request) {
  try {
    const { provider, apiKey } = await request.json(); assertProvider(provider);
    return Response.json(await providerService.configure(provider, apiKey));
  }
  catch (error) { return failure(error); }
}

export async function PATCH(request: Request) {
  try {
    const { provider, model } = await request.json(); assertSpeechToTextProvider(provider);
    return Response.json(providerService.configureSpeechToText(provider, model));
  } catch (error) { return failure(error); }
}
export async function DELETE(request: Request) {
  try { const { provider } = await request.json(); assertProvider(provider); return Response.json(providerService.disconnect(provider)); }
  catch (error) { return failure(error); }
}
function failure(error: unknown) { return Response.json({ error: error instanceof Error ? error.message : "Provider request failed." }, { status: 400 }); }
