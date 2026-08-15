import type { CharacterImageUpload, CreateCharacterInput, UpdateCharacterInput } from "@/shared/contracts";
import { characterService } from "@/server/services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() { return Response.json(characterService.list()); }

export async function POST(request: Request) {
  try {
    const input = await request.json() as Omit<CreateCharacterInput, "images"> & {
      images: Array<Omit<CharacterImageUpload, "bytes"> & { bytes: string }>;
    };
    return Response.json(characterService.create({ ...input, images: input.images.map((image) => ({
      ...image, bytes: new Uint8Array(Buffer.from(image.bytes, "base64")),
    })) }));
  } catch (error) { return failure(error); }
}

export async function PATCH(request: Request) {
  try {
    const input = await request.json() as Omit<UpdateCharacterInput, "newImages"> & {
      newImages: Array<Omit<CharacterImageUpload, "bytes"> & { bytes: string }>;
    };
    return Response.json(characterService.update({ ...input, newImages: input.newImages.map((image) => ({
      ...image, bytes: new Uint8Array(Buffer.from(image.bytes, "base64")),
    })) }));
  } catch (error) { return failure(error); }
}

export function DELETE(request: Request) {
  try {
    const id = new URL(request.url).searchParams.get("id");
    if (!id) throw new Error("Character ID is required.");
    characterService.remove(id); return Response.json({ ok: true });
  } catch (error) { return failure(error); }
}

function failure(error: unknown) {
  return Response.json({ error: error instanceof Error ? error.message : "Character request failed." }, { status: 400 });
}
