import { ProviderPage } from "@/components/ProviderPage";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Settings · DialogueLab Local", description: "Configure voice, text-to-speech, and speech-to-text providers." };

export default function Page() { return <ProviderPage />; }
