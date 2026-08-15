import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const testDirectory = mkdtempSync(join(tmpdir(), "dialoguelab-character-edit-"));
process.env.DIALOGUELAB_DATA_DIR = testDirectory;

try {
  const [{ db }, { characterService }] = await Promise.all([
    import("../src/server/database"),
    import("../src/server/services"),
  ]);
  const voiceId = crypto.randomUUID();
  db().prepare("INSERT INTO voices(id, provider, provider_voice_id, name, description, kind, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(voiceId, "elevenlabs", "test", "Test voice", "", "cloned", new Date().toISOString());
  const created = characterService.create({ name: "Nora", description: "Before", voiceId, images: [
    { name: "one.png", mimeType: "image/png", bytes: new Uint8Array([1]), label: "One", width: 100, height: 200 },
    { name: "two.png", mimeType: "image/png", bytes: new Uint8Array([2]), label: "Two", width: 300, height: 400 },
  ] });
  const updated = characterService.update({ localCharacterId: created.id, name: "Nora updated", description: "After", voiceId,
    existingImages: [{ id: created.images[1].id, label: "Retained pose", width: 320, height: 420 }],
    newImages: [{ name: "three.webp", mimeType: "image/webp", bytes: new Uint8Array([3]), label: "New pose", width: 500, height: 600 }],
  });
  if (updated.name !== "Nora updated" || updated.description !== "After" || updated.images.length !== 2
    || updated.images[0].id !== created.images[1].id || updated.images[0].label !== "Retained pose"
    || updated.images[0].width !== 320 || updated.images[1].label !== "New pose") throw new Error("Character edit verification failed.");
  let rejectedEmptyImages = false;
  try {
    characterService.update({ localCharacterId: created.id, name: updated.name, description: updated.description, voiceId,
      existingImages: [], newImages: [],
    });
  } catch { rejectedEmptyImages = true; }
  if (!rejectedEmptyImages) throw new Error("Removing every character image should be rejected.");
  console.log("Character editing verified: details changed, one image removed, one retained, and one added.");
} finally {
  const databaseGlobal = globalThis as typeof globalThis & { __dialogueDb?: { close(): void } };
  databaseGlobal.__dialogueDb?.close();
  rmSync(testDirectory, { recursive: true, force: true });
}
