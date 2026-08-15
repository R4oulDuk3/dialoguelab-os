import type { RenderQuality } from "@/shared/contracts";
import { renderService } from "@/server/render-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 3600;

export async function GET(request: Request) {
  try { const projectId = new URL(request.url).searchParams.get("projectId") || undefined; return Response.json(renderService.list(projectId)); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Could not list renders." }, { status: 400 }); }
}

export async function POST(request: Request) {
  try {
    const input = await request.json() as { localProjectId?: string; quality?: RenderQuality };
    if (!input.localProjectId) throw new Error("Project ID is required.");
    return Response.json(renderService.start(input.localProjectId, input.quality), { status: 202 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "The local render failed." }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  try { const input = await request.json() as { renderId?: string; operation?: "cancel" | "retry" }; if (!input.renderId) throw new Error("Render ID is required.");
    if (input.operation === "cancel") return Response.json(renderService.cancel(input.renderId));
    if (input.operation === "retry") return Response.json(renderService.retry(input.renderId), { status: 202 });
    throw new Error("Choose cancel or retry.");
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "The render operation failed." }, { status: 400 }); }
}

export async function DELETE(request: Request) {
  try { const renderId = new URL(request.url).searchParams.get("renderId"); if (!renderId) throw new Error("Render ID is required."); await renderService.remove(renderId); return Response.json({ ok: true }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Could not remove render." }, { status: 400 }); }
}
