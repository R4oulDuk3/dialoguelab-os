import type { CloneVoiceInput, DesignVoiceInput, ImageUpload, LinkVoiceInput, SaveDesignInput, UpdateVoiceInput } from "@/shared/contracts";
import { assertProvider, voiceService } from "@/server/services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() { return Response.json(voiceService.list()); }
export async function POST(request: Request) {
  try {
    const body = await request.json() as { operation: string; input: unknown };
    if (body.operation === "link") return Response.json(voiceService.link(body.input as LinkVoiceInput));
    if (body.operation === "clone") {
      const input = body.input as Omit<CloneVoiceInput, "audio"> & { audio: Omit<CloneVoiceInput["audio"], "bytes"> & { bytes: string } };
      assertProvider(input.provider);
      return Response.json(await voiceService.clone({ ...input, audio: { ...input.audio, bytes: new Uint8Array(Buffer.from(input.audio.bytes, "base64")) } }));
    }
    if (body.operation === "design") { const input = body.input as DesignVoiceInput; assertProvider(input.provider); return Response.json(await voiceService.design(input)); }
    if (body.operation === "save-design") { const input = body.input as SaveDesignInput; assertProvider(input.provider); return Response.json(await voiceService.saveDesign(input)); }
    if (body.operation === "update") {
      const input = body.input as Omit<UpdateVoiceInput, "image"> & { image?: Omit<ImageUpload, "bytes"> & { bytes: string } };
      return Response.json(voiceService.update({ ...input, image: input.image ? {
        ...input.image, bytes: new Uint8Array(Buffer.from(input.image.bytes, "base64")),
      } : undefined }));
    }
    throw new Error("Unknown voice operation.");
  } catch (error) { return failure(error); }
}
export function DELETE(request: Request) {
  try { const id = new URL(request.url).searchParams.get("id"); if (!id) throw new Error("Voice ID is required."); voiceService.remove(id); return Response.json({ ok: true }); }
  catch (error) { return failure(error); }
}
function failure(error: unknown) { return Response.json({ error: error instanceof Error ? error.message : "Voice request failed." }, { status: 400 }); }
