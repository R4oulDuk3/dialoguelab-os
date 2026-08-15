import { App } from "@/App";

export default async function CharacterPage({ params }: { params: Promise<{ characterId: string }> }) {
  const { characterId } = await params;
  return <App initialSection="characters" characterId={characterId} />;
}
