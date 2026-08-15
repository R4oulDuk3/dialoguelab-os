import { App } from "@/App";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <App initialSection="project" projectId={id} />;
}
