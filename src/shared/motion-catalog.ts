import type { ProjectMotionPreset } from "./contracts";

export type MotionPhase = "entrance" | "during" | "exit" | "combo";

export interface MotionPresetOption {
  id: ProjectMotionPreset;
  name: string;
  description: string;
  cue: "fade" | "left" | "right" | "up" | "down" | "scale" | "zoom" | "arc" | "float" | "drift" | "breathe" | "sway" | "shake" | "handheld" | "pulse" | "spin" | "glitch" | "dramatic" | "none";
}

export const MOTION_PHASES: Array<{ id: MotionPhase; name: string; shortName: string; description: string }> = [
  { id: "entrance", name: "Entrance animation", shortName: "Entrance", description: "How the element arrives on screen." },
  { id: "during", name: "On-screen motion", shortName: "On screen", description: "Subtle motion while the element is visible." },
  { id: "exit", name: "Exit animation", shortName: "Exit", description: "How the element leaves the screen." },
  { id: "combo", name: "Full-clip effect", shortName: "Full clip", description: "One effect that owns the whole clip." },
];

export const MOTION_PRESETS: Record<MotionPhase, MotionPresetOption[]> = {
  entrance: [
    option("none", "None", "Appear without an entrance effect.", "none"),
    option("fadeIn", "Fade in", "Gently reveal the element.", "fade"),
    option("slideInLeft", "Slide from left", "Enter from the left edge.", "left"),
    option("slideInRight", "Slide from right", "Enter from the right edge.", "right"),
    option("slideInUp", "Slide from bottom", "Rise into the frame.", "up"),
    option("slideInDown", "Slide from top", "Drop into the frame.", "down"),
    option("grow", "Grow", "Scale up from a tiny point.", "scale"),
    option("zoomIn", "Zoom in", "Settle back from a close zoom.", "zoom"),
    option("swooshIn", "Swoosh in", "Sweep in on a curved path.", "arc"),
    option("magnetIn", "Magnet in", "Snap into place with energy.", "arc"),
  ],
  during: [
    option("none", "None", "Stay still while visible.", "none"),
    option("float", "Float", "Slowly hover up and down.", "float"),
    option("drift", "Drift", "Glide gently across the frame.", "drift"),
    option("breathe", "Breathe", "Add a quiet breathing rhythm.", "breathe"),
    option("sway", "Sway", "Rock softly from side to side.", "sway"),
    option("shake", "Shake", "Add energetic, irregular movement.", "shake"),
    option("handheld", "Handheld", "Simulate a handheld camera feel.", "handheld"),
    option("pulse", "Pulse", "Rhythmically grow and settle.", "pulse"),
    option("spin", "Spin", "Rotate gently while visible.", "spin"),
    option("zoom", "Slow zoom", "Gradually push toward the element.", "zoom"),
  ],
  exit: [
    option("none", "None", "Disappear without an exit effect.", "none"),
    option("fadeOut", "Fade out", "Gently fade from the frame.", "fade"),
    option("slideOutLeft", "Slide to left", "Leave through the left edge.", "left"),
    option("slideOutRight", "Slide to right", "Leave through the right edge.", "right"),
    option("slideOutUp", "Slide to top", "Leave through the top edge.", "up"),
    option("slideOutDown", "Slide to bottom", "Leave through the bottom edge.", "down"),
    option("shrinkOut", "Shrink", "Collapse into a tiny point.", "scale"),
    option("zoomOut", "Zoom out", "Push forward and dissolve.", "zoom"),
    option("swooshOut", "Swoosh out", "Sweep away on a curved path.", "arc"),
    option("magnetOut", "Magnet out", "Snap away with energy.", "arc"),
  ],
  combo: [
    option("none", "None", "Use entrance, on-screen, and exit animations.", "none"),
    option("smoothGlitchZoomIn", "Glitch zoom in", "A controlled zoom with digital jitter.", "glitch"),
    option("smoothGlitchZoomOut", "Glitch zoom out", "Pull back with digital jitter.", "glitch"),
    option("smoothGlitchIntenseZoomIn", "Intense glitch in", "A stronger, faster glitch push.", "glitch"),
    option("smoothGlitchIntenseZoomOut", "Intense glitch out", "A stronger glitch pull-back.", "glitch"),
    option("dramaticZoomIn", "Dramatic zoom in", "Sweep across a bold push-in.", "dramatic"),
    option("dramaticZoomOut", "Dramatic zoom out", "Sweep across a bold pull-back.", "dramatic"),
  ],
};

export function motionPresetName(preset: ProjectMotionPreset): string {
  for (const options of Object.values(MOTION_PRESETS)) {
    const match = options.find((option) => option.id === preset);
    if (match) return match.name;
  }
  return preset;
}

function option(id: ProjectMotionPreset, name: string, description: string, cue: MotionPresetOption["cue"]): MotionPresetOption {
  return { id, name, description, cue };
}
