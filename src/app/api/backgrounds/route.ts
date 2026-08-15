import { backgroundService } from "@/server/services";

export const runtime = "nodejs";

export async function GET() { return Response.json(backgroundService.list()); }

export async function POST(request: Request) {
  try {
    const form = await request.formData(); const video = form.get("video");
    if (!(video instanceof File)) throw new Error("Choose a background video.");
    const background = await backgroundService.create({
      name: String(form.get("name") || ""), description: String(form.get("description") || ""),
      width: Number(form.get("width")), height: Number(form.get("height")), durationSeconds: Number(form.get("durationSeconds")),
      video: { name: video.name, mimeType: video.type, bytes: new Uint8Array(await video.arrayBuffer()) },
    });
    return Response.json(background, { status: 201 });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 }); }
}

export async function PATCH(request: Request) {
  try { const input = await request.json() as { localBackgroundId?: string; name?: string; description?: string }; if (!input.localBackgroundId) throw new Error("Background ID is required.");
    return Response.json(backgroundService.update({ localBackgroundId: input.localBackgroundId, name: input.name || "", description: input.description || "" })); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 }); }
}

export async function DELETE(request: Request) {
  try {
    const id = new URL(request.url).searchParams.get("id");
    if (!id) throw new Error("Background ID is required.");
    await backgroundService.remove(id); return Response.json({ ok: true });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 }); }
}
