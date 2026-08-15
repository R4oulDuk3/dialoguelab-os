import { mediaService } from "@/server/services";

export const runtime = "nodejs";
export async function GET() { return Response.json(mediaService.list()); }
export async function POST(request: Request) {
  try { const form = await request.formData(); const file = form.get("file"); if (!(file instanceof File)) throw new Error("Choose a media file.");
    const asset = await mediaService.create({ name: String(form.get("name") || file.name), width: Number(form.get("width") || 0), height: Number(form.get("height") || 0),
      durationSeconds: Number(form.get("durationSeconds") || 0), file: { name: file.name, mimeType: file.type, bytes: new Uint8Array(await file.arrayBuffer()) } });
    return Response.json(asset, { status: 201 });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 }); }
}
export async function DELETE(request: Request) {
  try { const id = new URL(request.url).searchParams.get("id"); if (!id) throw new Error("Media ID is required."); await mediaService.remove(id); return Response.json({ ok: true }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 }); }
}
