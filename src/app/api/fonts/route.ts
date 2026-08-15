import { fontService } from "@/server/font-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() { return Response.json(fontService.list()); }

export async function POST(request: Request) {
  try {
    const form = await request.formData(); const file = form.get("font"); if (!(file instanceof File)) throw new Error("Choose a font file.");
    return Response.json(await fontService.import({ family: String(form.get("family") || ""), file: { name: file.name, mimeType: file.type, bytes: new Uint8Array(await file.arrayBuffer()) } }), { status: 201 });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 }); }
}

export async function DELETE(request: Request) {
  try { const id = new URL(request.url).searchParams.get("id"); if (!id) throw new Error("Font ID is required."); await fontService.remove(id); return Response.json({ ok: true }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 }); }
}
