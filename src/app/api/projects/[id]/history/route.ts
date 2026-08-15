import { projectCommandService } from "@/server/project-command-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { const limit = Number(new URL(request.url).searchParams.get("limit") || 50); return Response.json(projectCommandService.history((await params).id, limit)); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Could not load project history." }, { status: 400 }); }
}
