import { compileProjectToHyperframes } from "@/server/hyperframes-composition";
import { backgroundService, characterService, mediaService, projectService, speechService } from "@/server/services";
import { fontService } from "@/server/font-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const project = projectService.get(id);
    const characters = characterService.list();
    const speechClips = speechService.list();
    const background = project.editorState.assets.backgroundId
      ? backgroundService.list().find((item) => item.id === project.editorState.assets.backgroundId)
      : undefined;
    const fonts = fontService.list(); const composition = compileProjectToHyperframes({
      project, characters, speechClips, background,
      assets: {
        gsapUrl: "/api/hyperframes/gsap",
        backgroundUrl: background?.videoUrl,
        characterImageUrls: new Map(characters.flatMap((character) => character.images.map((image) => [image.id, image.imageUrl] as const))),
        speechUrls: new Map(speechClips.map((speech) => [speech.id, speech.audioUrl] as const)),
        mediaUrls: new Map(mediaService.list().map((media) => [media.id, media.mediaUrl] as const)),
        fontUrls: new Map(fonts.map((font) => [font.family, font.fontUrl])), fontFormats: new Map(fonts.map((font) => [font.family, font.format])),
      },
    });
    return new Response(composition.html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
  } catch (error) {
    return new Response(error instanceof Error ? error.message : "Composition could not be created.", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  }
}
