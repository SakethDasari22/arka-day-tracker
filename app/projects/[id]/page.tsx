import { notFound } from "next/navigation";
import ProjectScreen from "@/components/pipeline/ProjectScreen";
import SetupNotice from "@/components/SetupNotice";
import { isDbConfigured } from "@/lib/db";
import { getProjectDetail } from "@/lib/pipeline";

export const dynamic = "force-dynamic";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  if (!isDbConfigured()) return <SetupNotice />;
  const { id } = await params;
  const n = Number(id);
  if (!Number.isInteger(n)) notFound();
  const detail = await getProjectDetail(n);
  if (!detail) notFound();
  // Keyed by the project so form state resets when switching projects.
  return <ProjectScreen key={n} detail={detail} />;
}
