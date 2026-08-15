import assert from "node:assert/strict";
import { compileMotionPreviewToHyperframes } from "../src/server/hyperframes-composition";
import { MOTION_PRESETS, type MotionPhase } from "../src/shared/motion-catalog";

for (const phase of Object.keys(MOTION_PRESETS) as MotionPhase[]) {
  for (const option of MOTION_PRESETS[phase]) {
    const html = compileMotionPreviewToHyperframes({
      assetUrl: phase === "during" ? "/api/media/file?id=preview" : "/api/characters/image?id=preview",
      assetKind: phase === "during" ? "video" : "image",
      characterPreview: phase !== "during",
      label: `Preview <${option.name}>`,
      phase,
      config: { preset: option.id, durationSeconds: phase === "during" ? .9 : .5, easing: "smooth", direction: "left" },
      gsapUrl: "/api/hyperframes/gsap",
    });
    assert.match(html, /data-composition-id="motion-preview"/);
    assert.match(html, /window\.__timelines\["motion-preview"\]/);
    assert.match(html, /autoAlpha: 1/);
    assert.doesNotMatch(html, /Preview <[^/]/);
    if (phase === "during") assert.match(html, /<video id="preview-media"/);
    else { assert.match(html, /<img src="\/api\/characters\/image/); assert.match(html, /class="character-preview"/); }
  }
}

console.log(JSON.stringify({ ok: true, phases: Object.keys(MOTION_PRESETS).length, presets: Object.values(MOTION_PRESETS).flat().length, images: true, videos: true, hyperframes: true }, null, 2));
