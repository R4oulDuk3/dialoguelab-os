import type { BackgroundRecord, CaptionFontFamily, CharacterRecord, ProjectCaptionAnimation, ProjectClipMotion, ProjectMotionConfig, ProjectRecord, ProjectSceneTransition, RedditPostData, SpeechClipRecord, SpeechWord } from "@/shared/contracts";
import { compileDialogueTimeline, FAKE_TEXT_FIRST_MESSAGE_SECONDS, fakeTextBlocks, fakeTextDurationSeconds, normalizeFakeTextSettings, resolveDialoguePerformanceCues } from "@/shared/project-timeline";
import { alignTranscriptWords } from "@/shared/speech-timing";
import type { MotionPhase } from "@/shared/motion-catalog";

export interface HyperframesCompositionAssets {
  gsapUrl: string;
  backgroundUrl?: string;
  characterImageUrls: ReadonlyMap<string, string>;
  speechUrls: ReadonlyMap<string, string>;
  mediaUrls?: ReadonlyMap<string, string>;
  fontUrls?: ReadonlyMap<CaptionFontFamily, string>;
  fontFormats?: ReadonlyMap<CaptionFontFamily, string>;
}

export interface HyperframesProjectComposition {
  html: string;
  durationSeconds: number;
  missingSpeechLineIds: string[];
  renderable: boolean;
}

export function compileMotionPreviewToHyperframes(input: {
  assetUrl?: string;
  assetKind: "image" | "video";
  characterPreview?: boolean;
  label: string;
  phase: MotionPhase;
  config: ProjectMotionConfig;
  gsapUrl: string;
}): string {
  const width = 720; const height = 405; const durationSeconds = input.phase === "combo" ? 3 : 2.6; const subjectId = "motion-preview-subject";
  const motion: ProjectClipMotion = {
    entrance: { preset: "none", durationSeconds: .5, easing: "smooth", direction: "up" },
    during: { preset: "none", durationSeconds: .8, easing: "smooth", direction: "up" },
    exit: { preset: "none", durationSeconds: .5, easing: "smooth", direction: "up" },
    combo: { preset: "none", durationSeconds: .5, easing: "smooth", direction: "up" },
    [input.phase]: input.config,
  };
  const source = input.assetUrl ? escapeAttribute(input.assetUrl) : "";
  const media = input.assetKind === "video" && source
    ? `<video id="preview-media" data-hf-id="motion-preview:media" data-timeline-label="Preview video" data-start="0" data-duration="${durationSeconds}" data-track-index="1" data-media-start="0" src="${source}" preload="auto" muted loop playsinline></video>`
    : source ? `<img src="${source}" alt="" />` : `<span>${escapeHtml(input.label.slice(0, 2).toUpperCase())}</span>`;
  const tweens = [`timeline.set(${JSON.stringify(`#${subjectId}`)}, { autoAlpha: 1 }, 0);`, ...motionScript(`#${subjectId}`, 0, durationSeconds, motion)];
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=${width}, height=${height}" />
  <title>Animation preview</title>
  <script src="${escapeAttribute(input.gsapUrl)}"></script>
  <style>
    *{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#17131e;font-family:Inter,Arial,sans-serif}
    #root{position:relative;width:${width}px;height:${height}px;overflow:hidden;background:radial-gradient(circle at 50% 42%,#3b3150 0,#211a2d 46%,#141019 100%)}
    #root:before{content:"";position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.035) 1px,transparent 1px);background-size:45px 45px}
    .preview-floor{position:absolute;left:8%;right:8%;bottom:10%;height:2px;background:linear-gradient(90deg,transparent,rgba(190,164,255,.5),transparent)}
    .preview-shell{position:absolute;left:50%;top:50%;width:64%;height:70%;transform:translate(-50%,-50%);display:grid;place-items:center}
    #${subjectId}{display:grid;width:100%;height:100%;place-items:center;transform-origin:center;will-change:transform,opacity;visibility:hidden}
    #${subjectId}.character-preview{width:240px;max-width:100%;height:120px}
    #${subjectId} img,#${subjectId} video{display:block;width:100%;height:100%;object-fit:contain;border-radius:16px}
    #${subjectId} video{object-fit:cover;box-shadow:0 22px 60px rgba(0,0,0,.34)}
    #${subjectId}>span{display:grid;width:132px;height:132px;place-items:center;border-radius:28px;color:#fff;background:linear-gradient(145deg,#9b63ff,#6122d4);font-size:48px;font-weight:800;box-shadow:0 24px 70px rgba(85,35,190,.45)}
    .preview-label{position:absolute;left:24px;bottom:18px;color:rgba(255,255,255,.7);font-size:14px;font-weight:700;letter-spacing:.02em}
  </style>
</head>
<body>
  <div id="root" data-composition-id="motion-preview" data-start="0" data-width="${width}" data-height="${height}" data-duration="${durationSeconds}" data-fps="30">
    <div class="clip" data-start="0" data-duration="${durationSeconds}" data-track-index="0"></div>
    <div class="preview-floor"></div>
    <div class="clip preview-shell" data-start="0" data-duration="${durationSeconds}" data-track-index="2"><div id="${subjectId}"${input.characterPreview ? ` class="character-preview"` : ""}>${media}</div></div>
    <div class="preview-label">${escapeHtml(input.label)}</div>
  </div>
  <script>
    window.__timelines = window.__timelines || {};
    const timeline = gsap.timeline({ paused: true });
    ${tweens.join("\n    ")}
    window.__timelines["motion-preview"] = timeline;
  </script>
</body>
</html>`;
}

export function compileProjectToHyperframes(input: {
  project: ProjectRecord;
  characters: CharacterRecord[];
  speechClips: SpeechClipRecord[];
  background?: BackgroundRecord;
  assets: HyperframesCompositionAssets;
}): HyperframesProjectComposition {
  const { project, characters, speechClips, background, assets } = input;
  if (project.editorState.projectType === "fake-text") return compileDialogueLabFakeTextProject(project, assets);
  const fps = Math.max(1, project.editorState.canvas.fps);
  const timeline = compileDialogueTimeline(project.editorState, speechClips, background?.durationSeconds);
  const durationSeconds = round(Math.max(1, timeline.durationSeconds));
  const missingSpeechLineIds = timeline.segments.filter((segment) => !segment.speech).map((segment) => segment.blockId);
  const characterById = new Map(characters.map((character) => [character.id, character]));
  const visualClips: string[] = [];
  const audioClips: string[] = [];
  const motionTweens: string[] = [];
  const captionGroups: string[] = [];
  const captionTranscript: CaptionTranscriptCue[] = [];
  const lanes = allocateTemporalLanes(timeline.segments);

  for (const [index, segment] of timeline.segments.entries()) {
    const character = characterById.get(segment.data.characterId);
    const image = character?.images.find((item) => item.id === segment.data.characterImageId) ?? character?.images[0];
    const imageUrl = image ? assets.characterImageUrls.get(image.id) : undefined;
    const characterRole = segment.roles.character; const speechRole = segment.roles.speech; const captionRole = segment.roles.captions;
    const characterTiming = visibleFrameWindow(characterRole.startSeconds, characterRole.startSeconds + characterRole.durationSeconds, fps);
    const lane = lanes.get(segment.blockId) ?? 0;
    if (project.editorState.projectType === "reddit-story" && index === 0 && segment.data.redditPost) {
      const cardDuration = Math.min(5, Math.max(1 / fps, segment.durationSeconds));
      const cardTiming = visibleFrameWindow(segment.startSeconds, segment.startSeconds + cardDuration, fps);
      if (cardTiming) {
        const cardId = `reddit-card-motion-${safeId(segment.blockId)}`;
        visualClips.push(redditPostCard(segment.blockId, cardId, segment.data.redditPost, segment.data.text, cardTiming.start, cardTiming.duration, 100 + lane));
        motionTweens.push(`timeline.fromTo(${JSON.stringify(`#${cardId}`)}, { y: 120, opacity: .35, scale: .96 }, { y: 0, opacity: 1, scale: 1, duration: ${round(Math.min(.6, cardTiming.duration / 3))}, ease: "power3.out" }, ${round(cardTiming.start)});`);
        if (cardTiming.duration > 2) motionTweens.push(`timeline.fromTo(${JSON.stringify(`#${cardId} .reddit-upvote`)}, { scale: 1 }, { scale: 1.18, color: "#ff4500", duration: .18, yoyo: true, repeat: 1, ease: "power2.out" }, ${round(cardTiming.start + Math.min(1.5, cardTiming.duration / 2))});`);
        if (cardTiming.duration > .9) motionTweens.push(`timeline.to(${JSON.stringify(`#${cardId}`)}, { y: 260, opacity: 0, duration: .3, ease: "power3.in", immediateRender: false }, ${round(cardTiming.start + cardTiming.duration - .3)});`);
      }
    } else if (character && image && imageUrl && characterTiming) {
      const position = segment.data.position;
      const transformStyle = segment.transform ? elementTransformStyle(segment.transform) : `width:${image.width}px;height:${image.height}px`;
      const subjectId = `motion-character-${safeId(segment.blockId)}`;
      const cueSteps = resolveDialoguePerformanceCues(segment.data, segment.speech).filter((entry) => entry.sourceSeconds >= characterRole.sourceStartSeconds
        && entry.sourceSeconds < characterRole.sourceStartSeconds + characterRole.durationSeconds && character.images.some((candidate) => candidate.id === entry.cue.characterImageId));
      const steps = [{ imageId: image.id, at: characterRole.startSeconds }, ...cueSteps.map((entry) => ({ imageId: entry.cue.characterImageId, at: characterRole.startSeconds + entry.sourceSeconds - characterRole.sourceStartSeconds }))]
        .filter((step, stepIndex, list) => !stepIndex || step.imageId !== list[stepIndex - 1].imageId);
      const poseIds = [...new Set(steps.map((step) => step.imageId))]; const poseDomIds = new Map(poseIds.map((imageId, poseIndex) => [imageId, `${subjectId}-pose-${poseIndex}`]));
      const poseImages = poseIds.map((imageId, poseIndex) => { const pose = character.images.find((candidate) => candidate.id === imageId); const source = assets.characterImageUrls.get(imageId); return pose && source
        ? `<img id="${poseDomIds.get(imageId)}" class="dialogue-performance-pose" src="${escapeAttribute(source)}" alt="${escapeAttribute(`${character.name} — ${pose.label}`)}" style="opacity:${poseIndex ? 0 : 1}" />` : ""; }).join("");
      visualClips.push(`<div id="character-${safeId(segment.blockId)}" data-hf-id="dialogue:${escapeAttribute(segment.blockId)}:character" data-timeline-label="Line ${index + 1} · Character" class="clip dialogue-character-shell${segment.transform ? " positioned" : ` position-${position}` }" data-start="${characterTiming.start}" data-duration="${characterTiming.duration}" data-track-index="${1 + lane}" style="${transformStyle}"><div id="${subjectId}" class="motion-subject dialogue-performance">${poseImages}</div></div>`);
      for (const step of steps.slice(1)) { const activeId = poseDomIds.get(step.imageId); if (!activeId) continue; const at = round(Math.max(characterTiming.start, Math.min(characterTiming.start + characterTiming.duration - 1 / fps, step.at)));
        motionTweens.push(`timeline.set(${JSON.stringify(`#${subjectId} .dialogue-performance-pose`)}, { opacity: 0 }, ${at}); timeline.set(${JSON.stringify(`#${activeId}`)}, { opacity: 1 }, ${at});`); }
      motionTweens.push(`timeline.set(${JSON.stringify(`#${subjectId}`)}, { autoAlpha: 1 }, ${round(characterTiming.start)});`, ...motionScript(`#${subjectId}`, characterTiming.start, characterTiming.duration, segment.motion), `timeline.set(${JSON.stringify(`#${subjectId}`)}, { autoAlpha: 0 }, ${round(characterTiming.start + characterTiming.duration)});`);
    }
    if (!segment.speech) continue;
    const audioUrl = assets.speechUrls.get(segment.speech.id);
    if (audioUrl) audioClips.push(`<audio id="speech-${safeId(segment.blockId)}" data-hf-id="dialogue:${escapeAttribute(segment.blockId)}:speech" data-timeline-label="Line ${index + 1} · Speech" data-timeline-role="voiceover" data-start="${round(speechRole.startSeconds)}" data-duration="${round(speechRole.durationSeconds)}" data-track-index="${20_000 + lane}" data-media-start="${round(speechRole.sourceStartSeconds)}" data-volume="1" src="${escapeAttribute(audioUrl)}"></audio>`);
    if (!segment.data.hideSubtitles) {
      const captionWords = segment.data.captionWordsOverride ?? alignTranscriptWords(segment.speech.text, segment.speech.words, segment.speech.durationSeconds);
      captionGroups.push(...captionClips(segment.blockId, captionRole.startSeconds, captionRole.sourceStartSeconds, segment.speech.text, captionWords, captionRole.durationSeconds, fps, project.editorState.captions.wordsPerPage, project.editorState.captions.switchCaptionsEveryMs, project.editorState.captionAnimation, motionTweens, captionTranscript));
    }
  }

  if (captionGroups.length) visualClips.push(`<div id="captions-root" data-hf-id="captions:root" data-timeline-label="Captions" data-timeline-role="captions" data-caption-root="true" class="clip captions-root" data-start="0" data-duration="${durationSeconds}" data-track-index="40000"><div id="caption-container" class="caption-container">${captionGroups.join("")}</div></div>`);

  let authoredIndex = 0;
  for (const track of timeline.tracks) for (const clip of track.clips) {
    const itemId = typeof clip.metadata?.itemId === "string" ? clip.metadata.itemId : undefined; if (!itemId || clip.metadata?.hidden === true) continue;
    const transform = clip.metadata?.transform as import("@/shared/contracts").ProjectElementTransform | undefined; const style = elementTransformStyle(transform);
    const motion = clip.metadata?.motion as ProjectClipMotion | undefined; const transition = clip.metadata?.transition as ProjectSceneTransition | undefined;
    const volume = Math.max(0, Math.min(1, Number(clip.metadata?.volume ?? 1))); const playbackRate = Math.max(.25, Math.min(4, Number(clip.metadata?.playbackRate ?? 1)));
    const muted = clip.metadata?.muted === true || volume === 0; const loop = clip.metadata?.loop === true;
    const common = `id="item-${safeId(itemId)}" data-hf-id="item:${escapeAttribute(itemId)}" data-timeline-label="${escapeAttribute(String(clip.metadata?.text || clip.kind))}" data-start="${round(clip.startSeconds)}" data-duration="${round(clip.durationSeconds)}" data-track-index="${50_000 + authoredIndex++}"`;
    const subjectId = `motion-item-${safeId(itemId)}`; const start = round(clip.startSeconds); const duration = round(clip.durationSeconds);
    if (clip.kind === "text") visualClips.push(`<div ${common} class="clip authored-shell authored-text-shell" style="${style}"><div id="${subjectId}" class="motion-subject authored-text">${escapeHtml(String(clip.metadata?.text || ""))}</div></div>`);
    else if (clip.kind === "character-pose") {
      const characterId = typeof clip.metadata?.characterId === "string" ? clip.metadata.characterId : ""; const imageId = typeof clip.metadata?.characterImageId === "string" ? clip.metadata.characterImageId : "";
      const character = characterById.get(characterId); const image = character?.images.find((entry) => entry.id === imageId); const source = image ? assets.characterImageUrls.get(image.id) : undefined; if (!source) continue;
      visualClips.push(`<div ${common} class="clip authored-shell authored-character-pose" style="${style}"><img id="${subjectId}" class="motion-subject" src="${escapeAttribute(source)}" alt="${escapeAttribute(character?.name ?? "Character")}" /></div>`);
    } else {
      const source = clip.sourceId ? assets.mediaUrls?.get(clip.sourceId) : undefined; if (!source) continue; const mediaStart = round(Number(clip.metadata?.sourceStartSeconds ?? 0));
      if (clip.kind === "image") visualClips.push(`<div ${common} class="clip authored-shell" style="${style}"><img id="${subjectId}" class="motion-subject" src="${escapeAttribute(source)}" alt="" /></div>`);
      else if (clip.kind === "video") visualClips.push(`<div id="wrap-item-${safeId(itemId)}" class="authored-shell" style="${style}"><div id="${subjectId}" class="motion-subject"><video ${common} class="authored-video" data-media-start="${mediaStart}" data-playback-rate="${round(playbackRate)}" data-volume="${round(volume)}" src="${escapeAttribute(source)}" preload="auto"${muted ? " muted" : ""}${loop ? " loop" : ""} playsinline></video></div></div>`);
      else if (clip.kind === "audio") audioClips.push(`<audio ${common} data-media-start="${mediaStart}" data-playback-rate="${round(playbackRate)}" data-volume="${muted ? 0 : round(volume)}" src="${escapeAttribute(source)}"${muted ? " muted" : ""}${loop ? " loop" : ""}></audio>`);
    }
    if (clip.kind !== "audio") {
      motionTweens.push(`timeline.set(${JSON.stringify(`#${subjectId}`)}, { autoAlpha: 1 }, ${start});`, ...motionScript(`#${subjectId}`, start, duration, motion, transition), `timeline.set(${JSON.stringify(`#${subjectId}`)}, { autoAlpha: 0 }, ${round(start + duration)});`);
    }
  }

  const backgroundClip = background && assets.backgroundUrl
    ? `<video id="dialogue-background" data-hf-id="background:main" data-timeline-label="Background" data-timeline-locked data-start="0" data-duration="${durationSeconds}" data-track-index="0" data-media-start="${round(project.editorState.assets.backgroundStartSeconds)}" src="${escapeAttribute(assets.backgroundUrl)}" preload="auto" muted playsinline loop></video>`
    : "";
  const width = project.editorState.canvas.width; const height = project.editorState.canvas.height;
  const compositionId = `${project.editorState.projectType === "reddit-story" ? "reddit-story" : "dialogue"}-${safeId(project.id)}`;
  const captions = project.editorState.captions; const fontUrl = assets.fontUrls?.get(captions.fontFamily); const fontFormat = assets.fontFormats?.get(captions.fontFamily) ?? "woff2";
  const captionPosition = `top:${round(Math.max(0, Math.min(height, captions.verticalPositionPx)))}px;transform:translateY(-50%);`;
  const shadow = captions.shadowEnabled ? `${captions.shadowOffsetX}px ${captions.shadowOffsetY}px ${captions.shadowBlurPx}px ${hexToRgba(captions.shadowColor, captions.shadowOpacity)}` : "none";
  const surfaceColor = captions.surfaceEnabled ? hexToRgba(captions.surfaceColor, captions.surfaceOpacity) : "transparent";
  const surfaceBorder = captions.surfaceEnabled && captions.surfaceBorderWidthPx > 0 ? `${captions.surfaceBorderWidthPx}px solid ${captions.surfaceBorderColor}` : "0 solid transparent";
  const surfaceShadow = captions.surfaceEnabled && captions.surfaceShadowOpacity > 0
    ? `${captions.surfaceShadowOffsetX}px ${captions.surfaceShadowOffsetY}px ${captions.surfaceShadowBlurPx}px ${hexToRgba(captions.surfaceShadowColor, captions.surfaceShadowOpacity)}` : "none";
  const activeWordBackground = captions.activeWordEmphasis === "highlight" ? captions.activeWordColor : "transparent";
  const activeWordText = captions.activeWordEmphasis === "text" ? captions.activeWordColor : captions.activeWordTextColor;
  const activeWordUnderline = captions.activeWordEmphasis === "underline" ? `max(2px,.05em) solid ${captions.activeWordColor}` : "max(2px,.05em) solid transparent";
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=${width}, height=${height}" />
  <title>${escapeHtml(project.name)} &middot; DialogueLab</title>
  <script src="${escapeAttribute(assets.gsapUrl)}"></script>
  <style>
    ${fontUrl ? `@font-face{font-family:${JSON.stringify(captions.fontFamily)};src:url(${JSON.stringify(fontUrl)}) format(${JSON.stringify(fontFormat)});font-style:normal;font-weight:100 900;font-display:block}` : ""}
    *{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#111}body{font-family:Inter,Arial,sans-serif}
    #root{position:relative;width:${width}px;height:${height}px;overflow:hidden}
    .stage-fill{position:absolute;inset:0;background:#111;z-index:0}
    #dialogue-background{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:1}
    .dialogue-character-shell{position:absolute;bottom:0;z-index:2}.dialogue-character-shell.positioned,.authored-shell{position:absolute;bottom:auto;transform-origin:center center}.motion-subject{display:block;width:100%;height:100%;visibility:hidden;transform-origin:center center;will-change:transform,opacity}.dialogue-performance{position:relative}.dialogue-performance-pose{position:absolute;inset:0}.dialogue-character-shell img,.authored-shell img,.authored-video{width:100%;height:100%;display:block;object-fit:contain}.authored-video{object-fit:cover}
    .position-left{left:1%}.position-right{right:1%}.position-center{left:50%;transform:translateX(-50%)}
    .captions-root,.caption-container{position:absolute;inset:0;z-index:4;overflow:visible}.dialogue-caption{position:absolute;left:${(100 - captions.maxWidthPercent) / 2}%;right:${(100 - captions.maxWidthPercent) / 2}%;${captionPosition}z-index:4;display:block;white-space:nowrap;visibility:hidden;opacity:0;color:${captions.textColor};font-family:${JSON.stringify(captions.fontFamily)},Arial,sans-serif;font-size:${captions.fontSizePx}px;line-height:${captions.lineHeight};font-weight:${captions.fontWeight};text-align:${captions.alignment};text-transform:${captions.textTransform};text-shadow:${shadow};-webkit-text-stroke:${captions.strokeWidthPx}px ${captions.strokeColor};paint-order:stroke fill;transform-origin:center center;will-change:transform,opacity}
    .caption-surface{max-width:100%;display:inline-flex;align-items:center;justify-content:center;gap:${captions.wordGapEm}em;padding:${captions.surfaceEnabled ? captions.surfacePaddingY : 0}px ${captions.surfaceEnabled ? captions.surfacePaddingX : 0}px;background:${surfaceColor};border:${surfaceBorder};border-radius:${captions.surfaceEnabled ? captions.surfaceBorderRadiusPx : 0}px;box-shadow:${surfaceShadow};white-space:nowrap}
    .dialogue-caption .caption-word{display:inline-block;flex:none;color:${captions.textColor};opacity:${captions.inactiveWordOpacity};border-bottom:max(2px,.05em) solid transparent;border-radius:${captions.activeWordRadiusPx}px;transform:scale(1);transform-origin:center center;will-change:transform,opacity}
    .dialogue-caption .caption-word.spoken{color:${captions.textColor};opacity:1;background:transparent;box-shadow:none;border-bottom-color:transparent;transform:scale(1)}
    .dialogue-caption .caption-word.active{color:${activeWordText};opacity:1;background:${activeWordBackground};box-shadow:${captions.activeWordEmphasis === "highlight" ? `0 0 0 .09em ${captions.activeWordColor}` : "none"};border-bottom:${activeWordUnderline};transform:scale(${captions.activeWordScale})}
    .authored-text{display:flex;align-items:center;justify-content:center;padding:2%;color:#fff;font:800 72px/1.1 Inter,Arial,sans-serif;text-align:center;text-shadow:0 3px 10px rgba(0,0,0,.75);white-space:pre-wrap}.caption-motion{white-space:nowrap;transform-origin:center center;will-change:transform,opacity}
    .reddit-card-clip{position:absolute;inset:0;display:flex;align-items:flex-start;justify-content:center;padding:8% 5%}.reddit-card-motion{width:min(90%,900px);margin-top:6%;padding:34px;background:#1a1a2e;border:1px solid #343536;border-radius:22px;box-shadow:0 18px 70px rgba(0,0,0,.58);color:#d7dadc;transform-origin:center}.reddit-post-header{display:flex;align-items:center;gap:16px;margin-bottom:24px}.reddit-icon{display:grid;place-items:center;width:52px;height:52px;flex:none;border-radius:50%;background:#ff4500;color:#fff;font-weight:900;font-size:22px}.reddit-meta{display:flex;flex-direction:column;gap:3px}.reddit-meta b{font-size:27px}.reddit-meta span{color:#929496;font-size:21px}.reddit-title{font-size:38px;line-height:1.26;font-weight:800;margin-bottom:15px}.reddit-body{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;color:#aeb0b2;font-size:27px;line-height:1.42}.reddit-actions{display:flex;align-items:center;gap:24px;margin-top:28px;padding-top:20px;border-top:1px solid #343536;color:#aeb0b2;font-size:23px}.reddit-action{display:flex;align-items:center;gap:8px;padding:9px 16px;border-radius:22px;background:#272729}.reddit-upvote{font-weight:800;color:#d7dadc}@media(max-aspect-ratio:1/1){.reddit-card-clip{padding:12% 6%}.reddit-card-motion{margin-top:9%;padding:38px}.reddit-title{font-size:42px}.reddit-body{font-size:30px}.reddit-meta b{font-size:30px}}
  </style>
</head>
<body>
  <div id="root" data-composition-id="${compositionId}" data-start="0" data-width="${width}" data-height="${height}" data-duration="${durationSeconds}" data-fps="${fps}">
    <div id="stage-fill" class="clip stage-fill" data-start="0" data-duration="${durationSeconds}" data-track-index="60000"></div>
    ${backgroundClip}
    ${visualClips.join("\n    ")}
    ${audioClips.join("\n    ")}
  </div>
  <script>
    window.__timelines = window.__timelines || {};
    var TRANSCRIPT = ${safeJson(captionTranscript)};
    function fitDialogueCaptions() {
      const maxSize = ${captions.fontSizePx};
      const minSize = Math.min(maxSize, Math.max(36, Math.round(maxSize * .4)));
      const strokeWidth = ${captions.strokeWidthPx};
      document.querySelectorAll(".dialogue-caption").forEach((caption) => {
        let size = maxSize;
        for (let attempt = 0; attempt < 12; attempt += 1) {
          caption.style.fontSize = size + "px";
          const surface = caption.querySelector(".caption-surface");
          const contentWidth = (surface ? surface.scrollWidth : caption.scrollWidth) + strokeWidth * 2;
          const availableWidth = Math.max(1, caption.clientWidth);
          if (contentWidth <= availableWidth || size <= minSize) break;
          size = Math.max(minSize, Math.floor(size * availableWidth / Math.max(1, contentWidth)) - 2);
        }
      });
    }
    fitDialogueCaptions();
    document.fonts?.ready.then(fitDialogueCaptions);
    const timeline = gsap.timeline({ paused: true });
    ${motionTweens.join("\n    ")}
    window.__timelines[${JSON.stringify(compositionId)}] = timeline;
  </script>
</body>
</html>`;
  return { html, durationSeconds, missingSpeechLineIds, renderable: timeline.durationSeconds > 0 && missingSpeechLineIds.length === 0 };
}

function compileDialogueLabFakeTextProject(project: ProjectRecord, assets: HyperframesCompositionAssets): HyperframesProjectComposition {
  const { width, height, fps } = project.editorState.canvas; const messages = fakeTextBlocks(project.editorState); const settings = normalizeFakeTextSettings(project.editorState.fakeText);
  const durationSeconds = round(Math.max(1, fakeTextDurationSeconds(project.editorState))); const compositionId = `fake-text-${safeId(project.id)}`;
  const panelWidth = Math.round(width * settings.phoneScalePercent / 100); const panelHeight = Math.round(height * .95); const headerHeight = settings.showHeader ? Math.round(panelWidth * .18) : 0; const bodyHeight = panelHeight - headerHeight; const panelRadius = Math.round(panelWidth * .055);
  const bubbleFontSize = Math.max(22, Math.round(panelWidth * .043)); const smallFontSize = Math.max(14, Math.round(panelWidth * .024)); const themeDark = settings.phoneTheme === "dark";
  const headerBackground = themeDark ? "rgba(28,28,30,.97)" : "rgba(249,249,251,.97)"; const bodyBackground = themeDark ? "rgba(17,17,19,.97)" : "rgba(255,255,255,.97)"; const ink = themeDark ? "#F5F5F7" : "#151517"; const secondaryInk = themeDark ? "#A5A5AC" : "#73737A";
  const initials = (settings.contactName.trim() || "Contact").split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() || "").join("");
  const bubbleTextWidth = panelWidth * .72 - bubbleFontSize * 1.4; const averageGlyphWidth = bubbleFontSize * .52; const charsPerLine = Math.max(16, Math.floor(bubbleTextWidth / averageGlyphWidth));
  const messageData = safeJson(messages.map((message) => { const lineCount = Math.max(1, Math.ceil(message.data.text.length / Math.max(1, charsPerLine * .86))); const senderHeight = settings.showSenders && message.data.sender ? smallFontSize * 1.35 : 0; return { ...message.data, rowHeight: Math.round(lineCount * bubbleFontSize * 1.25 + bubbleFontSize * .92 + senderHeight) }; }));
  const backgroundMedia = assets.backgroundUrl
    ? `<video id="fake-text-gameplay" class="clip" data-hf-id="background:gameplay" data-timeline-label="Gameplay background" data-timeline-locked data-start="0" data-duration="${durationSeconds}" data-track-index="0" data-media-start="${round(project.editorState.assets.backgroundStartSeconds)}" src="${escapeAttribute(assets.backgroundUrl)}" preload="auto" muted playsinline loop></video>`
    : `<div id="compact-gameplay-fallback" data-layout-ignore><i></i><i></i><i></i><span></span></div>`;
  const html = `<!doctype html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=${width}, height=${height}" /><title>${escapeHtml(project.name)} &middot; Fake Text</title><script src="${escapeAttribute(assets.gsapUrl)}"></script><style>
    *{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#111;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","Segoe UI",sans-serif}#root{position:relative;width:${width}px;height:${height}px;overflow:hidden;isolation:isolate;--out-fill:${settings.outgoingBubbleColor};--out-ink:${settings.outgoingTextColor};--in-fill:${settings.incomingBubbleColor};--in-ink:${settings.incomingTextColor}}
    #fake-text-gameplay,#compact-gameplay-fallback,#compact-gameplay-scrim{position:absolute;inset:0;width:100%;height:100%}#fake-text-gameplay{object-fit:cover;background:#111}#compact-gameplay-scrim{background:rgba(7,10,16,${round(settings.gameplayDimPercent / 100)});box-shadow:inset 0 0 ${Math.round(width * .18)}px rgba(0,0,0,.16);pointer-events:none}#compact-gameplay-fallback{overflow:hidden;background:radial-gradient(circle at 20% 12%,${settings.backgroundTopColor},transparent 34%),${settings.backgroundBottomColor}}#compact-gameplay-fallback i{position:absolute;width:48%;height:17%;border-radius:${Math.round(width * .025)}px;background:rgba(255,255,255,.14);box-shadow:0 ${Math.round(height * .2)}px 0 rgba(12,22,38,.2);transform:rotate(-17deg)}#compact-gameplay-fallback i:nth-child(1){left:-8%;top:12%}#compact-gameplay-fallback i:nth-child(2){right:-9%;top:34%;transform:rotate(15deg)}#compact-gameplay-fallback i:nth-child(3){left:10%;bottom:11%;transform:rotate(9deg)}#compact-gameplay-fallback span{position:absolute;left:36%;bottom:-10%;width:28%;height:68%;background:rgba(8,17,29,.22);transform:perspective(600px) rotateX(58deg)}
    #chat-panel{position:absolute;z-index:4;top:${Math.round(height * .025)}px;left:50%;width:${panelWidth}px;height:${panelHeight}px;overflow:hidden;border-radius:${panelRadius}px;background:${bodyBackground};box-shadow:0 ${Math.round(panelWidth * .025)}px ${Math.round(panelWidth * .07)}px rgba(0,0,0,.34);transform:translateX(-50%);will-change:transform,opacity}
    #chat-header{height:${headerHeight}px;padding:0 ${Math.round(panelWidth * .045)}px;display:grid;grid-template-columns:${Math.round(panelWidth * .19)}px 1fr ${Math.round(panelWidth * .14)}px;align-items:center;background:${headerBackground};border-bottom:1px solid ${themeDark ? "#36363A" : "#E2E2E6"};color:${ink}}.back-cluster{display:flex;align-items:center;gap:${Math.round(panelWidth * .02)}px;color:#0A84FF}.chevron{font-size:${Math.round(panelWidth * .075)}px;font-weight:300;line-height:1}.unread{min-width:${Math.round(panelWidth * .07)}px;height:${Math.round(panelWidth * .055)}px;padding:0 ${Math.round(panelWidth * .016)}px;display:grid;place-items:center;border-radius:999px;color:#fff;background:#0A84FF;font-size:${Math.round(panelWidth * .028)}px;font-weight:750}.contact{display:flex;align-items:center;justify-content:center;flex-direction:column;gap:${Math.round(panelWidth * .008)}px}.avatar{width:${Math.round(panelWidth * .09)}px;height:${Math.round(panelWidth * .09)}px;display:grid;place-items:center;border-radius:50%;color:${ink};background:${themeDark ? "#5A5A60" : "#E2E2E5"};font-size:${Math.round(panelWidth * .035)}px;font-weight:650}.contact b{font-size:${Math.round(panelWidth * .033)}px;line-height:1}.contact b:after{content:"  ›"}.video-icon{justify-self:end;width:${Math.round(panelWidth * .07)}px;height:${Math.round(panelWidth * .048)}px;border:3px solid #0A84FF;border-radius:${Math.round(panelWidth * .012)}px;position:relative}.video-icon:after{content:"";position:absolute;right:-${Math.round(panelWidth * .024)}px;top:50%;width:${Math.round(panelWidth * .025)}px;height:${Math.round(panelWidth * .034)}px;background:#0A84FF;clip-path:polygon(0 50%,100% 0,100% 100%);transform:translateY(-50%)}
    #message-window{position:absolute;right:0;bottom:0;left:0;height:${bodyHeight}px;overflow:hidden;background:${bodyBackground}}#compact-column{position:absolute;inset:0}.compact-row{position:absolute;right:5%;bottom:${Math.round(bodyHeight * .045)}px;left:5%;display:flex;flex-direction:column;justify-content:flex-end;opacity:0;will-change:transform,opacity}.compact-row[data-side=incoming]{align-items:flex-start}.compact-row[data-side=outgoing]{align-items:flex-end}.compact-sender{padding:0 ${Math.round(bubbleFontSize * .5)}px ${Math.round(bubbleFontSize * .14)}px;color:${secondaryInk};font-size:${smallFontSize}px;font-weight:650}.compact-bubble{position:relative;max-width:80%;padding:${Math.round(bubbleFontSize * .46)}px ${Math.round(bubbleFontSize * .7)}px;border-radius:${Math.round(bubbleFontSize * .92)}px;font-size:${bubbleFontSize}px;font-weight:430;letter-spacing:-.018em;line-height:1.25;overflow-wrap:anywhere;white-space:pre-wrap}.compact-row[data-side=incoming] .compact-bubble{color:var(--in-ink);background:var(--in-fill);transform-origin:0 100%}.compact-row[data-side=outgoing] .compact-bubble{color:var(--out-ink);background:var(--out-fill);transform-origin:100% 100%}.compact-row[data-side=incoming] .compact-bubble:after,.compact-row[data-side=outgoing] .compact-bubble:after{content:"";position:absolute;bottom:0;width:${Math.round(bubbleFontSize * .5)}px;height:${Math.round(bubbleFontSize * .6)}px;background:inherit}.compact-row[data-side=incoming] .compact-bubble:after{left:-${Math.round(bubbleFontSize * .22)}px;border-bottom-right-radius:${Math.round(bubbleFontSize * .6)}px}.compact-row[data-side=outgoing] .compact-bubble:after{right:-${Math.round(bubbleFontSize * .22)}px;border-bottom-left-radius:${Math.round(bubbleFontSize * .6)}px}#compact-typing{position:absolute;left:5%;bottom:${Math.round(bodyHeight * .045)}px;display:flex;gap:${Math.round(bubbleFontSize * .22)}px;padding:${Math.round(bubbleFontSize * .55)}px ${Math.round(bubbleFontSize * .68)}px;border-radius:${Math.round(bubbleFontSize)}px;background:var(--in-fill);opacity:0}#compact-typing i{width:${Math.round(bubbleFontSize * .22)}px;height:${Math.round(bubbleFontSize * .22)}px;border-radius:50%;background:#8E8E93}#compact-driver{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none}
  </style></head><body><div id="root" data-composition-id="${compositionId}" data-start="0" data-width="${width}" data-height="${height}" data-duration="${durationSeconds}" data-fps="${fps}">${backgroundMedia}<div id="compact-gameplay-scrim" data-layout-ignore></div><section id="chat-panel">${settings.showHeader ? `<header id="chat-header"><span class="back-cluster"><i class="chevron">‹</i>${settings.unreadCount ? `<i class="unread">${settings.unreadCount}</i>` : ""}</span><span class="contact"><i class="avatar">${escapeHtml(initials || "A")}</i><b>${escapeHtml(settings.contactName || "Contact")}</b></span><i class="video-icon"></i></header>` : ""}<div id="message-window"><div id="compact-column"></div><div id="compact-typing"><i></i><i></i><i></i></div></div></section><div id="compact-driver" class="clip" data-hf-id="fake-text:messages" data-timeline-label="Fake Text messages" data-start="0" data-duration="${durationSeconds}" data-track-index="100"></div></div><script>
    window.__timelines=window.__timelines||{};const messages=${messageData};const column=document.getElementById("compact-column");const panel=document.getElementById("chat-panel");const typing=document.getElementById("compact-typing");const rows=[];document.getElementById("chat-header")?.setAttribute("data-layout-allow-overlap","");document.getElementById("message-window").setAttribute("data-layout-allow-overlap","");messages.forEach((message,index)=>{const row=document.createElement("div");row.id="compact-message-"+index;row.className="compact-row";row.dataset.side=message.side;row.style.height=message.rowHeight+"px";row.setAttribute("data-layout-allow-overlap","");if(${settings.showSenders ? "true" : "false"}&&message.sender){const sender=document.createElement("div");sender.className="compact-sender";sender.textContent=message.sender;row.appendChild(sender)}const bubble=document.createElement("div");bubble.className="compact-bubble";bubble.textContent=message.text;row.appendChild(bubble);column.appendChild(row);rows.push(row)});const timeline=gsap.timeline({paused:true});timeline.fromTo(panel,{y:-${Math.round(height * .025)},scale:.985,opacity:.2},{y:0,scale:1,opacity:1,duration:.42,ease:"power3.out"},0);${settings.showTypingIndicator ? `timeline.fromTo(typing,{opacity:0,scale:.9},{opacity:1,scale:1,duration:.2,ease:"power3.out"},.08);timeline.to("#compact-typing i",{y:-${Math.round(bubbleFontSize * .13)},duration:.08,yoyo:true,repeat:3,stagger:.08,ease:"sine.inOut"},.12);timeline.to(typing,{opacity:0,duration:.1},${round(FAKE_TEXT_FIRST_MESSAGE_SECONDS - .1)});` : ""}const offsets=rows.map(()=>0);const gap=${Math.round(bubbleFontSize * .34)};rows.forEach((row,index)=>{const at=${FAKE_TEXT_FIRST_MESSAGE_SECONDS}+index*${round(settings.staggerSeconds)};const direction=row.dataset.side==="incoming"?-1:1;if(index>0){const distance=messages[index].rowHeight+gap;const shiftDuration=Math.min(.48,${round(settings.staggerSeconds)}*.55);const shiftAt=Math.max(0,at-shiftDuration);rows.slice(0,index).forEach((previous,previousIndex)=>{const from=offsets[previousIndex];const target=from-distance;timeline.to(previous,{y:from-distance*.1,duration:shiftDuration*.2,ease:"power3.in"},shiftAt);timeline.to(previous,{y:from-distance*.75,duration:shiftDuration*.18,ease:"none"},shiftAt+shiftDuration*.2);timeline.to(previous,{y:target,duration:shiftDuration*.62,ease:"power4.out"},shiftAt+shiftDuration*.38);offsets[previousIndex]=target})}timeline.fromTo(row,{x:direction*${Math.round(panelWidth * .025)},y:${Math.round(panelWidth * .012)},scale:.9,opacity:0},{x:0,y:0,scale:1,opacity:1,duration:.32,ease:"power3.out"},at)});window.__timelines[${JSON.stringify(compositionId)}]=timeline;
  </script></body></html>`;
  return { html, durationSeconds, missingSpeechLineIds: [], renderable: messages.length > 0 && messages.every((message) => Boolean(message.data.text.trim())) };
}


function redditPostCard(blockId: string, subjectId: string, post: RedditPostData, story: string, start: number, duration: number, trackIndex: number): string {
  const body = story.trim().replace(/\s+/g, " ");
  const excerpt = body.length > 260 ? `${body.slice(0, 257).trimEnd()}...` : body;
  const subreddit = post.subreddit.trim().replace(/^r\//i, "") || "stories";
  const username = post.username.trim().replace(/^u\//i, "") || "storyteller";
  return `<div id="reddit-card-${safeId(blockId)}" data-hf-id="dialogue:${escapeAttribute(blockId)}:character" data-timeline-label="Reddit post" class="clip reddit-card-clip" data-start="${round(start)}" data-duration="${round(duration)}" data-track-index="${trackIndex}"><article id="${subjectId}" class="reddit-card-motion"><header class="reddit-post-header"><span class="reddit-icon">r/</span><span class="reddit-meta"><b>r/${escapeHtml(subreddit)}</b><span>u/${escapeHtml(username)} &middot; ${escapeHtml(post.postedAgo || "3h")}</span></span></header><div class="reddit-title">${escapeHtml(post.title.trim() || "Untitled Reddit story")}</div><div class="reddit-body">${escapeHtml(excerpt)}</div><footer class="reddit-actions"><span class="reddit-action reddit-upvote">&#9650; ${escapeHtml(post.upvotes || "0")}</span><span class="reddit-action">&#9679; ${escapeHtml(post.comments || "0")} comments</span><span class="reddit-action">Share</span></footer></article></div>`;
}

interface CaptionToken { text: string; startSeconds: number; endSeconds: number }
interface CaptionTranscriptCue { text: string; start: number; end: number }

function captionClips(blockId: string, segmentStart: number, sourceStart: number, transcript: string, words: SpeechWord[], speechDuration: number, fps: number, pageSize: number, switchCaptionsEveryMs: number, animation: ProjectCaptionAnimation, tweens: string[], transcriptCues: CaptionTranscriptCue[]): string[] {
  const sourceEnd = sourceStart + speechDuration;
  const tokens = captionTokens(words).filter((token) => token.endSeconds > sourceStart && token.startSeconds < sourceEnd); const result: string[] = [];
  if (!tokens.length && transcript.trim()) {
    const timing = visibleFrameWindow(segmentStart, segmentStart + speechDuration, fps);
    if (!timing) return []; const subjectId = `caption-motion-${safeId(blockId)}-fallback`; const end = round(timing.start + timing.duration);
    transcriptCues.push({ text: transcript.trim(), start: timing.start, end });
    tweens.push(`timeline.set(${JSON.stringify(`#${subjectId}`)}, { autoAlpha: 1 }, ${timing.start});`, ...captionMotionScript(`#${subjectId}`, timing.start, timing.duration, animation), `timeline.set(${JSON.stringify(`#${subjectId}`)}, { autoAlpha: 0 }, ${end});`);
    return [`<div id="${subjectId}" data-hf-id="dialogue:${escapeAttribute(blockId)}:captions:fallback" class="dialogue-caption caption-group caption-motion"><div class="caption-surface"><span class="caption-word active">${escapeHtml(transcript.trim())}</span></div></div>`];
  }
  const size = Math.max(1, Math.min(8, pageSize)); const pageWindowSeconds = Math.max(.1, switchCaptionsEveryMs / 1000);
  for (const token of tokens) transcriptCues.push({ text: token.text, start: round(segmentStart + Math.max(0, token.startSeconds - sourceStart)), end: round(segmentStart + Math.min(speechDuration, token.endSeconds - sourceStart)) });
  for (let pageStart = 0, groupIndex = 0; pageStart < tokens.length; groupIndex++) {
    let pageEnd = pageStart + 1; const sourcePageLimit = tokens[pageStart].startSeconds + pageWindowSeconds;
    while (pageEnd < tokens.length && pageEnd - pageStart < size && tokens[pageEnd].startSeconds < sourcePageLimit) pageEnd++;
    const page = tokens.slice(pageStart, pageEnd); const nextPage = tokens[pageEnd];
    const cueStart = segmentStart + Math.max(0, page[0].startSeconds - sourceStart);
    const naturalEnd = nextPage ? segmentStart + Math.max(0, nextPage.startSeconds - sourceStart) : segmentStart + speechDuration;
    const cueEnd = Math.min(segmentStart + speechDuration, naturalEnd);
    const timing = visibleFrameWindow(cueStart, cueEnd, fps); pageStart = pageEnd; if (!timing) continue;
    const subjectId = `caption-motion-${safeId(blockId)}-${groupIndex}`; const end = round(timing.start + timing.duration);
    const spans = page.map((word, wordIndex) => `<span id="caption-word-${safeId(blockId)}-${groupIndex}-${wordIndex}" class="caption-word${wordIndex === 0 ? " active" : ""}">${escapeHtml(word.text)}</span>`).join("");
    tweens.push(`timeline.set(${JSON.stringify(`#${subjectId}`)}, { autoAlpha: 1 }, ${timing.start});`, ...captionMotionScript(`#${subjectId}`, timing.start, timing.duration, animation));
    tweens.push(`timeline.set(${JSON.stringify(`#${subjectId} .caption-word`)}, { className: "caption-word" }, ${timing.start});`);
    for (const [wordIndex, word] of page.entries()) {
      const at = round(segmentStart + Math.max(0, word.startSeconds - sourceStart)); const selector = `#caption-word-${safeId(blockId)}-${groupIndex}-${wordIndex}`;
      if (wordIndex > 0) tweens.push(`timeline.set(${JSON.stringify(`#caption-word-${safeId(blockId)}-${groupIndex}-${wordIndex - 1}`)}, { className: "caption-word spoken" }, ${at});`);
      tweens.push(`timeline.set(${JSON.stringify(selector)}, { className: "caption-word active" }, ${at});`);
    }
    tweens.push(`timeline.set(${JSON.stringify(`#${subjectId}`)}, { autoAlpha: 0 }, ${end});`);
    result.push(`<div id="${subjectId}" data-hf-id="dialogue:${escapeAttribute(blockId)}:captions:${groupIndex}" class="dialogue-caption caption-group caption-motion"><div class="caption-surface">${spans}</div></div>`);
  }
  return result;
}

function captionTokens(words: SpeechWord[]): CaptionToken[] {
  const tokens: CaptionToken[] = [];
  for (const word of words) {
    if (word.type === "spacing" || !word.text) continue;
    if (word.type === "punctuation" && tokens.length) {
      const previous = tokens[tokens.length - 1]; previous.text += word.text; previous.endSeconds = Math.max(previous.endSeconds, word.endSeconds); continue;
    }
    tokens.push({ text: word.text, startSeconds: word.startSeconds, endSeconds: word.endSeconds });
  }
  return tokens;
}

function allocateTemporalLanes(segments: Array<{ blockId: string; startSeconds: number; endSeconds: number }>): Map<string, number> {
  const laneEnds: number[] = []; const result = new Map<string, number>();
  for (const segment of [...segments].sort((a, b) => a.startSeconds - b.startSeconds || a.endSeconds - b.endSeconds)) {
    let lane = laneEnds.findIndex((end) => end <= segment.startSeconds + 1e-7); if (lane < 0) lane = laneEnds.length;
    laneEnds[lane] = segment.endSeconds; result.set(segment.blockId, lane);
  }
  return result;
}

function elementTransformStyle(transform?: import("@/shared/contracts").ProjectElementTransform): string {
  if (!transform) return ""; return `left:${round(transform.xPercent)}%;top:${round(transform.yPercent)}%;width:${round(transform.widthPercent)}%;height:${round(transform.heightPercent)}%;opacity:${round(transform.opacity)};z-index:${transform.zIndex};transform:translate(-50%,-50%) rotate(${round(transform.rotationDegrees)}deg)`;
}

function motionScript(selector: string, startSeconds: number, durationSeconds: number, motion?: ProjectClipMotion, transition?: ProjectSceneTransition): string[] {
  const result: string[] = []; const transitionDuration = Math.min(durationSeconds / 2, Math.max(0, transition?.durationSeconds ?? 0));
  if (motion?.combo && motion.combo.preset !== "none") return comboMotionTweens(selector, motion.combo, startSeconds, durationSeconds);
  if (transition && transition.preset !== "cut" && transitionDuration > 0) {
    const from = transition.preset === "slide" ? directionVars(transition.direction, 96) : transition.preset === "zoom" ? { scale: .72, opacity: 0 } : { opacity: 0 };
    result.push(`timeline.fromTo(${JSON.stringify(selector)}, ${JSON.stringify(from)}, ${JSON.stringify({ x: 0, y: 0, scale: 1, opacity: 1, duration: round(transitionDuration), ease: "power2.inOut" })}, ${round(startSeconds)});`);
  } else if (motion && motion.entrance.preset !== "none") result.push(motionTween(selector, motion.entrance, startSeconds, durationSeconds, true));
  if (motion && motion.during.preset !== "none") result.push(...duringMotionTweens(selector, motion.during, startSeconds, durationSeconds, motion.entrance.durationSeconds, motion.exit.durationSeconds));
  if (motion && motion.exit.preset !== "none") result.push(motionTween(selector, motion.exit, startSeconds, durationSeconds, false));
  return result.filter(Boolean);
}

function motionTween(selector: string, config: ProjectMotionConfig, startSeconds: number, clipDuration: number, entrance: boolean): string {
  const duration = round(Math.min(Math.max(0, config.durationSeconds), clipDuration / 2)); if (!duration) return "";
  const hidden = edgeMotionVars(config, entrance); const rest = { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 };
  const ease = config.preset === "magnetIn" && entrance ? "back.out(1.4)" : config.preset === "magnetOut" && !entrance ? "power4.in"
    : config.easing === "snappy" ? "power4.out" : config.easing === "gentle" ? "sine.inOut" : "power3.out";
  const at = entrance ? startSeconds : startSeconds + clipDuration - duration; const from = entrance ? hidden : rest; const to = { ...(entrance ? rest : hidden), duration, ease: entrance ? ease : config.easing === "gentle" ? "sine.inOut" : "power3.in", ...(entrance ? {} : { immediateRender: false }) };
  return `timeline.fromTo(${JSON.stringify(selector)}, ${JSON.stringify(from)}, ${JSON.stringify(to)}, ${round(at)});`;
}

function duringMotionTweens(selector: string, config: ProjectMotionConfig, startSeconds: number, clipDuration: number, entranceSeconds: number, exitSeconds: number): string[] {
  const available = Math.max(0, clipDuration - Math.min(clipDuration / 2, entranceSeconds) - Math.min(clipDuration / 2, exitSeconds));
  const duration = round(Math.min(Math.max(.1, config.durationSeconds), available / 2)); if (!duration || available < .2) return [];
  const at = round(startSeconds + Math.min(clipDuration / 2, entranceSeconds));
  if (config.preset === "shake") return sampledDuringMotion(selector, at, available, .12, (progress) => ({ x: round((.7 * Math.sin(27 * progress) + .3 * Math.sin(57 * progress)) * 3), y: round((.6 * Math.cos(33 * progress) + .4 * Math.cos(53 * progress)) * 3) }));
  if (config.preset === "handheld") return sampledDuringMotion(selector, at, available, .3, (progress) => ({ x: round(Math.sin(progress * Math.PI * 2) * 8 + Math.sin(progress * Math.PI * 7) * 1.2), y: round(Math.cos(progress * Math.PI * 1.4) * 8 + Math.cos(progress * Math.PI * 6) * 1.2), rotation: round(Math.sin(progress * Math.PI * 2) * .4), scale: 1.06 }));
  let repeats = Math.max(1, Math.floor(available / duration) - 1); if (repeats % 2 === 0) repeats = Math.max(1, repeats - 1);
  const ease = config.easing === "snappy" ? "power2.inOut" : "sine.inOut";
  const vars = config.preset === "float" ? { y: -35 } : config.preset === "pulse" ? { scale: 1.06 } : config.preset === "breathe" ? { scale: 1.005, opacity: .95 }
    : config.preset === "sway" ? { x: config.direction === "left" ? -3 : 3, rotation: config.direction === "left" ? -.2 : .2 }
    : config.preset === "drift" ? { ...directionVars(config.direction, 24), y: config.direction === "left" || config.direction === "right" ? -12 : directionVars(config.direction, 12).y }
    : config.preset === "spin" ? { rotation: 6 } : config.preset === "zoom" ? { scale: 1.05 } : {};
  if (!Object.keys(vars).length) return [];
  return [`timeline.to(${JSON.stringify(selector)}, ${JSON.stringify({ ...vars, duration, repeat: repeats, yoyo: true, ease })}, ${at});`];
}

function edgeMotionVars(config: ProjectMotionConfig, entrance: boolean): Record<string, number> {
  const preset = config.preset;
  if (preset === "slideInLeft" || preset === "slideOutLeft") return { x: -1200, y: 0, opacity: 0 };
  if (preset === "slideInRight" || preset === "slideOutRight") return { x: 1200, y: 0, opacity: 0 };
  if (preset === "slideInUp") return { x: 0, y: 2000, opacity: 0 };
  if (preset === "slideInDown") return { x: 0, y: -2000, opacity: 0 };
  if (preset === "slideOutUp") return { x: 0, y: -2000, opacity: 0 };
  if (preset === "slideOutDown") return { x: 0, y: 2000, opacity: 0 };
  if (preset === "grow" || preset === "shrinkOut") return { scale: .01, opacity: 0 };
  if (preset === "zoomIn") return { scale: 1.5, opacity: 0 };
  if (preset === "zoomOut") return { scale: 2, opacity: 0 };
  if (preset === "swooshIn") return { x: -80, y: 50, scale: .4, rotation: -8, opacity: .2 };
  if (preset === "swooshOut") return { x: 80, y: 50, scale: .4, rotation: 8, opacity: 0 };
  if (preset === "magnetIn") return { x: -120, y: -80, scale: .3, rotation: -12, opacity: 0 };
  if (preset === "magnetOut") return { x: 120, y: 80, scale: .3, rotation: 12, opacity: 0 };
  if (preset === "slide") return { ...directionVars(config.direction, entrance ? 72 : -72), opacity: 0 };
  if (preset === "rise") return { x: 0, y: entrance ? 90 : -90, opacity: 0 };
  if (preset === "drop") return { x: 0, y: entrance ? -90 : 90, opacity: 0 };
  if (preset === "pop") return { scale: .18, opacity: 0 };
  if (preset === "scale" || preset === "zoom") return { scale: preset === "zoom" ? 1.35 : .82, opacity: 0 };
  if (preset === "spin") return { rotation: entrance ? -30 : 30, scale: .75, opacity: 0 };
  return { opacity: 0 };
}

function sampledDuringMotion(selector: string, at: number, available: number, stepSeconds: number, sample: (progress: number) => Record<string, number>): string[] {
  const count = Math.max(2, Math.floor(available / stepSeconds)); const duration = available / count; const result: string[] = [];
  for (let index = 1; index <= count; index++) {
    const final = index === count; const values = final ? { x: 0, y: 0, rotation: 0, scale: 1 } : sample(index / count);
    result.push(`timeline.to(${JSON.stringify(selector)}, ${JSON.stringify({ ...values, duration: round(duration), ease: "none", immediateRender: false })}, ${round(at + (index - 1) * duration)});`);
  }
  return result;
}

function comboMotionTweens(selector: string, config: ProjectMotionConfig, startSeconds: number, clipDuration: number): string[] {
  const preset = config.preset; if (!clipDuration) return [];
  if (preset === "dramaticZoomIn" || preset === "dramaticZoomOut") {
    const zoomIn = preset === "dramaticZoomIn"; const from = { x: zoomIn ? -20 : 20, y: -12, scale: zoomIn ? 1.25 : 1.85, rotation: zoomIn ? -8 : 8, opacity: 1 };
    const to = { x: zoomIn ? 20 : -20, y: 12, scale: zoomIn ? 1.85 : 1, rotation: 0, opacity: 1, duration: round(clipDuration), ease: "sine.inOut" };
    return [`timeline.fromTo(${JSON.stringify(selector)}, ${JSON.stringify(from)}, ${JSON.stringify(to)}, ${round(startSeconds)});`];
  }
  const intense = preset === "smoothGlitchIntenseZoomIn" || preset === "smoothGlitchIntenseZoomOut"; const zoomIn = preset === "smoothGlitchZoomIn" || preset === "smoothGlitchIntenseZoomIn";
  const count = Math.max(4, Math.min(12, Math.floor(clipDuration / .18))); const segment = clipDuration / count; const result: string[] = [];
  const valueAt = (index: number) => { const progress = index / count; const jitter = [0, 2, -2, 1, -1, 3, -3, 0][index % 8] * (intense ? 1.8 : 1); const pan = (intense ? 35 : 25) * (-1 + progress * 2); return {
    x: round((zoomIn ? pan : -pan) + jitter), y: round((intense ? pan : 0) - jitter / 2), scale: round((zoomIn ? 1 + progress * (intense ? .5 : .35) : (intense ? 1.5 : 1.35) - progress * (intense ? .5 : .35))), rotation: round(Math.sin(progress * Math.PI * 4) * (intense ? 2.2 : 1)), opacity: 1,
  }; };
  result.push(`timeline.fromTo(${JSON.stringify(selector)}, ${JSON.stringify(valueAt(0))}, ${JSON.stringify({ ...valueAt(1), duration: round(segment), ease: "power1.inOut" })}, ${round(startSeconds)});`);
  for (let index = 2; index <= count; index++) result.push(`timeline.to(${JSON.stringify(selector)}, ${JSON.stringify({ ...valueAt(index), duration: round(segment), ease: "power1.inOut", immediateRender: false })}, ${round(startSeconds + (index - 1) * segment)});`);
  return result;
}

function captionMotionScript(selector: string, startSeconds: number, cueDuration: number, animation: ProjectCaptionAnimation): string[] {
  const duration = round(Math.min(Math.max(0, animation.durationSeconds), cueDuration * .8)); if (!duration || animation.preset === "none") return [];
  if (animation.preset === "word-reveal") return [`timeline.fromTo(${JSON.stringify(`${selector} .caption-word`)}, { y: 24, opacity: 0 }, { y: 0, opacity: 1, duration: ${duration}, stagger: ${round(Math.min(.06, duration / 5))}, ease: "power4.out" }, ${round(startSeconds)});`];
  if (animation.preset === "karaoke") { const half = round(duration / 2); return [`timeline.fromTo(${JSON.stringify(`${selector} .active`)}, { scale: .9 }, { scale: 1.08, duration: ${half}, ease: "power3.out" }, ${round(startSeconds)});`, `timeline.to(${JSON.stringify(`${selector} .active`)}, { scale: 1, duration: ${half}, ease: "sine.out" }, ${round(startSeconds + half)});`]; }
  const from = animation.preset === "bounce" ? { y: 26, scale: .88, opacity: 0 } : { scale: .86, opacity: 0 };
  const ease = animation.preset === "bounce" ? "back.out(1.4)" : "power3.out";
  return [`timeline.fromTo(${JSON.stringify(selector)}, ${JSON.stringify(from)}, { y: 0, scale: 1, opacity: 1, duration: ${duration}, ease: ${JSON.stringify(ease)} }, ${round(startSeconds)});`];
}

function directionVars(direction: ProjectMotionConfig["direction"], amount: number) { return direction === "left" ? { x: -amount, y: 0 } : direction === "right" ? { x: amount, y: 0 } : direction === "down" ? { x: 0, y: amount } : { x: 0, y: -amount }; }

function visibleFrameWindow(startSeconds: number, endSeconds: number, fps: number): { start: number; duration: number } | undefined {
  const firstFrame = Math.max(0, Math.ceil(startSeconds * fps - 1e-7));
  const lastFrame = Math.ceil(endSeconds * fps - 1e-7) - 1;
  if (lastFrame < firstFrame) return undefined;
  return { start: round(firstFrame / fps), duration: round(Math.max(1e-6, (lastFrame - firstFrame + 1) / fps)) };
}

function safeId(value: string): string { return value.replace(/[^a-zA-Z0-9_-]/g, "-"); }
function round(value: number): number { return Number(value.toFixed(6)); }
function escapeHtml(value: string): string { return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;"); }
function escapeAttribute(value: string): string { return escapeHtml(value).replaceAll('"', "&quot;").replaceAll("'", "&#39;"); }
function safeJson(value: unknown): string { return JSON.stringify(value).replaceAll("<", "\\u003c").replaceAll("\u2028", "\\u2028").replaceAll("\u2029", "\\u2029"); }
function hexToRgba(hex: string, opacity: number) { const value = hex.replace("#", ""); const number = Number.parseInt(value, 16); return `rgba(${number >> 16},${(number >> 8) & 255},${number & 255},${opacity})`; }
