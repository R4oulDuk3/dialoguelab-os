import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const directory = await mkdtemp(join(tmpdir(), "dialoguelab-guards-"));
process.env.DIALOGUELAB_DATA_DIR = directory;
try {
  const { projectService } = await import("../src/server/services");
  const { db } = await import("../src/server/database");
  const input = { name: "Experimental", description: "", projectType: "fake-text" as const, width: 1080, height: 1920, fps: 30 };
  assert.throws(() => projectService.create(input), /still in development/);
  process.env.DIALOGUELAB_ENABLE_EXPERIMENTAL_PROJECTS = "1";
  assert.equal(projectService.create(input).editorState.projectType, "fake-text");
  console.log(JSON.stringify({ ok: true, experimentalCreationBlockedByDefault: true, optInWorks: true }, null, 2));
  db().close();
} finally {
  await rm(directory, { recursive: true, force: true });
}
