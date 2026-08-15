import { App } from "@/App";

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ new?: string | string[] }> }) {
  const query = await searchParams;
  return <App initialSection="projects" createProject={query.new !== undefined} />;
}
