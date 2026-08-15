import type { ProjectMotionConfig, ProjectMotionEasing, ProjectMotionPreset } from "@/shared/contracts";
import type { MotionPhase } from "@/shared/motion-catalog";
import { normalizeMotionConfig, PROJECT_MOTION_PRESETS } from "@/shared/project-timeline";
import { compileMotionPreviewToHyperframes } from "@/server/hyperframes-composition";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PHASES: MotionPhase[] = ["entrance", "during", "exit", "combo"];
const EASINGS: ProjectMotionEasing[] = ["smooth", "snappy", "gentle"];
const DIRECTIONS: ProjectMotionConfig["direction"][] = ["left", "right", "up", "down"];

export async function GET(request: Request) {
  try {
    const url = new URL(request.url); const rawPhase = url.searchParams.get("phase"); const rawPreset = url.searchParams.get("preset");
    if (!PHASES.includes(rawPhase as MotionPhase) || !PROJECT_MOTION_PRESETS.includes(rawPreset as ProjectMotionPreset)) return new Response("Unknown animation preset.", { status: 400 });
    const assetUrl = localAssetUrl(url.searchParams.get("asset"), url); const duration = Number(url.searchParams.get("duration"));
    const config = normalizeMotionConfig({
      preset: rawPreset as ProjectMotionPreset,
      durationSeconds: Number.isFinite(duration) ? Math.max(.1, Math.min(3, duration)) : .5,
      easing: EASINGS.includes(url.searchParams.get("easing") as ProjectMotionEasing) ? url.searchParams.get("easing") as ProjectMotionEasing : "smooth",
      direction: DIRECTIONS.includes(url.searchParams.get("direction") as ProjectMotionConfig["direction"]) ? url.searchParams.get("direction") as ProjectMotionConfig["direction"] : "up",
    });
    const html = compileMotionPreviewToHyperframes({
      assetUrl,
      assetKind: url.searchParams.get("kind") === "video" ? "video" : "image",
      characterPreview: url.searchParams.get("fit") === "character",
      label: (url.searchParams.get("label") || "Selected element").slice(0, 80),
      phase: rawPhase as MotionPhase,
      config,
      gsapUrl: "/api/hyperframes/gsap",
    });
    return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
  } catch (error) {
    return new Response(error instanceof Error ? error.message : "Animation preview could not be created.", { status: 400, headers: { "content-type": "text/plain; charset=utf-8" } });
  }
}

function localAssetUrl(value: string | null, requestUrl: URL): string | undefined {
  if (!value) return undefined; const parsed = new URL(value, requestUrl);
  if (parsed.origin !== requestUrl.origin || !parsed.pathname.startsWith("/api/")) throw new Error("Only local project assets can be previewed.");
  return `${parsed.pathname}${parsed.search}`;
}
