"use client";

import { LoaderCircle, MessagesSquare } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { dialogueApi } from "@/lib/client-api";

export function CreateFakeTextButton() {
  const router = useRouter(); const [creating, setCreating] = useState(false); const [error, setError] = useState<string>();
  async function createFakeText() {
    if (creating) return; setCreating(true); setError(undefined);
    try { const project = await dialogueApi.projects.create({ name: "Untitled Text Story", description: "", projectType: "fake-text", width: 1080, height: 1920, fps: 30 }); router.push(`/projects/${encodeURIComponent(project.id)}`); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); setCreating(false); }
  }
  return <button type="button" className="sidebar-dialogue-create" disabled={creating} aria-busy={creating} title={error} onClick={() => void createFakeText()}>{creating ? <LoaderCircle className="spin" size={17} /> : <MessagesSquare size={17} />}{creating ? "Creating…" : "Text story"}</button>;
}
