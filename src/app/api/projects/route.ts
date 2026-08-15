import type { CreateProjectInput, UpdateProjectInput } from "@/shared/contracts";
import { projectService } from "@/server/services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  try { const id = new URL(request.url).searchParams.get("id"); return Response.json(id ? projectService.get(id) : projectService.list()); }
  catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try { return Response.json(projectService.create(await request.json() as CreateProjectInput), { status: 201 }); }
  catch (error) { return failure(error); }
}
export async function PATCH(request: Request) {
  try { return Response.json(projectService.update(await request.json() as UpdateProjectInput)); }
  catch (error) { return failure(error); }
}
export function DELETE(request: Request) {
  try { const id = new URL(request.url).searchParams.get("id"); if (!id) throw new Error("Project ID is required."); projectService.remove(id); return Response.json({ ok: true }); }
  catch (error) { return failure(error); }
}
function failure(error: unknown) { return Response.json({ error: error instanceof Error ? error.message : "Project operation failed." }, { status: 400 }); }
