import ProjectsScreen from "@/components/pipeline/ProjectsScreen";
import SetupNotice from "@/components/SetupNotice";
import { isDbConfigured } from "@/lib/db";
import { listProjects } from "@/lib/pipeline";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  if (!isDbConfigured()) return <SetupNotice />;
  const projects = await listProjects();
  return <ProjectsScreen projects={projects} />;
}
