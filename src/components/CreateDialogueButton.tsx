"use client";

import { LoaderCircle, MessageSquare } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { dialogueApi } from "@/lib/client-api";

export function CreateDialogueButton() {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string>();

  async function createDialogue() {
    if (creating) return;
    setCreating(true);
    setError(undefined);
    try {
      const project = await dialogueApi.projects.create({
        name: "Untitled project",
        description: "",
        width: 1080,
        height: 1920,
        fps: 30,
      });
      router.push(`/projects/${encodeURIComponent(project.id)}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setCreating(false);
    }
  }

  return <button type="button" className="sidebar-dialogue-create" disabled={creating} aria-busy={creating} title={error} onClick={() => void createDialogue()}>
    {creating ? <LoaderCircle className="spin" size={17} /> : <MessageSquare size={17} />}
    {creating ? "Creating…" : "Dialogue"}
  </button>;
}
