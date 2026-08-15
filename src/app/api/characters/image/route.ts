import { characterService } from "@/server/services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return new Response("Character image ID is required.", { status: 400 });
  const image = characterService.image(id);
  if (!image) return new Response("Image not found.", { status: 404 });
  return new Response(Buffer.from(image.image_data), { headers: {
    "content-type": image.mime_type,
    "cache-control": "private, max-age=31536000, immutable",
  } });
}
