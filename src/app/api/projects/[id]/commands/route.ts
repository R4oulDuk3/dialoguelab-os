import type { ProjectCommand, ProjectEditSource } from "@/shared/contracts";
import { ProjectRevisionConflict, projectCommandService } from "@/server/project-command-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const input = await request.json() as { commands?: ProjectCommand[]; expectedRevision?: number; source?: ProjectEditSource; summary?: string };
    return Response.json(projectCommandService.apply({ localProjectId: (await params).id, commands: input.commands ?? [], expectedRevision: input.expectedRevision,
      source: input.source ?? "ui", summary: input.summary }));
  } catch (error) { return failure(error); }
}

function failure(error: unknown) {
  if (error instanceof ProjectRevisionConflict) return Response.json({ error: error.message, code: error.code, currentRevision: error.currentRevision }, { status: 409 });
  return Response.json({ error: error instanceof Error ? error.message : "Project edit failed.", code: "VALIDATION_ERROR" }, { status: 400 });
}
