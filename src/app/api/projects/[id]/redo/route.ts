import { ProjectRevisionConflict, projectCommandService } from "@/server/project-command-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { const input = await request.json().catch(() => ({})) as { expectedRevision?: number }; return Response.json(projectCommandService.redo((await params).id, input.expectedRevision)); }
  catch (error) { return failure(error); }
}

function failure(error: unknown) { const conflict = error instanceof ProjectRevisionConflict; return Response.json({ error: error instanceof Error ? error.message : "Redo failed.", code: conflict ? error.code : "VALIDATION_ERROR" }, { status: conflict ? 409 : 400 }); }
