import { projectCommandService } from "@/server/project-command-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { return Response.json(projectCommandService.timeline((await params).id)); }
  catch (error) { return failure(error); }
}

function failure(error: unknown) { return Response.json({ error: error instanceof Error ? error.message : "Could not compile project timeline." }, { status: 400 }); }
