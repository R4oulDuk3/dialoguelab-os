import type { CharacterRecord, CreateCharacterInput, UpdateCharacterInput } from "@/shared/contracts";
import { db } from "./database";

interface CharacterRow {
  id: string; name: string; description: string; voice_id: string; voice_name: string; voice_provider: CharacterRecord["voiceProvider"]; created_at: string;
}
interface CharacterImageRow {
  id: string; character_id: string; label: string; width: number; height: number;
}
interface StoredCharacterImage { mime_type: string; image_data: Uint8Array; }

export const characterRepository = {
  list(): CharacterRecord[] {
    const characters = db().prepare(`SELECT characters.*, voices.name AS voice_name, voices.provider AS voice_provider
      FROM characters JOIN voices ON voices.id = characters.voice_id ORDER BY characters.created_at DESC`).all() as unknown as CharacterRow[];
    const images = db().prepare("SELECT id, character_id, label, width, height FROM character_images ORDER BY sort_order").all() as unknown as CharacterImageRow[];
    return characters.map((character) => fromRows(character, images.filter((image) => image.character_id === character.id)));
  },
  get(id: string): CharacterRecord | undefined { return this.list().find((character) => character.id === id); },
  create(input: CreateCharacterInput): CharacterRecord {
    const id = crypto.randomUUID(); const createdAt = new Date().toISOString(); const database = db();
    database.exec("BEGIN IMMEDIATE");
    try {
      database.prepare("INSERT INTO characters(id, name, description, voice_id, created_at) VALUES (?, ?, ?, ?, ?)")
        .run(id, input.name, input.description, input.voiceId, createdAt);
      const insertImage = database.prepare(`INSERT INTO character_images(id, character_id, label, mime_type, image_data, width, height, sort_order, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      input.images.forEach((image, index) => insertImage.run(crypto.randomUUID(), id, image.label, image.mimeType,
        Buffer.from(image.bytes), image.width, image.height, index, createdAt));
      database.exec("COMMIT");
    } catch (error) { database.exec("ROLLBACK"); throw error; }
    return this.get(id)!;
  },
  update(input: UpdateCharacterInput): CharacterRecord {
    const database = db(); const updatedAt = new Date().toISOString();
    database.exec("BEGIN IMMEDIATE");
    try {
      database.prepare("UPDATE characters SET name = ?, description = ?, voice_id = ? WHERE id = ?")
        .run(input.name, input.description, input.voiceId, input.localCharacterId);
      const keepIds = new Set(input.existingImages.map((image) => image.id));
      const storedIds = database.prepare("SELECT id FROM character_images WHERE character_id = ?").all(input.localCharacterId) as unknown as Array<{ id: string }>;
      const removeImage = database.prepare("DELETE FROM character_images WHERE id = ? AND character_id = ?");
      storedIds.filter((image) => !keepIds.has(image.id)).forEach((image) => removeImage.run(image.id, input.localCharacterId));
      const updateImage = database.prepare("UPDATE character_images SET label = ?, width = ?, height = ?, sort_order = ? WHERE id = ? AND character_id = ?");
      input.existingImages.forEach((image, index) => updateImage.run(image.label, image.width, image.height, index, image.id, input.localCharacterId));
      const insertImage = database.prepare(`INSERT INTO character_images(id, character_id, label, mime_type, image_data, width, height, sort_order, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      input.newImages.forEach((image, index) => insertImage.run(crypto.randomUUID(), input.localCharacterId, image.label, image.mimeType,
        Buffer.from(image.bytes), image.width, image.height, input.existingImages.length + index, updatedAt));
      database.exec("COMMIT");
    } catch (error) { database.exec("ROLLBACK"); throw error; }
    return this.get(input.localCharacterId)!;
  },
  image(id: string): StoredCharacterImage | undefined {
    return db().prepare("SELECT mime_type, image_data FROM character_images WHERE id = ?").get(id) as unknown as StoredCharacterImage | undefined;
  },
  remove(id: string): void { db().prepare("DELETE FROM characters WHERE id = ?").run(id); },
};

function fromRows(character: CharacterRow, images: CharacterImageRow[]): CharacterRecord {
  return { id: character.id, name: character.name, description: character.description, voiceId: character.voice_id,
    voiceName: character.voice_name, voiceProvider: character.voice_provider, createdAt: character.created_at,
    images: images.map((image) => ({ id: image.id, label: image.label, width: image.width, height: image.height,
      imageUrl: `/api/characters/image?id=${encodeURIComponent(image.id)}` })) };
}
