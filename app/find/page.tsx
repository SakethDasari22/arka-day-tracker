import FinderScreen from "@/components/pipeline/FinderScreen";
import SetupNotice from "@/components/SetupNotice";
import { isDbConfigured, query } from "@/lib/db";
import { finderAllowed, finderConfigured, listSearches } from "@/lib/finder";

export const dynamic = "force-dynamic";

export default async function FindPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string; search?: string }>;
}) {
  if (!isDbConfigured()) return <SetupNotice />;
  const sp = await searchParams;
  const [searches, projects] = await Promise.all([
    listSearches(15),
    query<{ id: number; client: string; product: string; specs: string | null }>(
      `SELECT id, client, product, specs FROM projects
        WHERE status IN ('active','on_hold') ORDER BY id DESC`
    ).then((r) => r.rows),
  ]);
  return (
    <FinderScreen
      searches={searches}
      projects={projects}
      configured={finderConfigured()}
      allowed={finderAllowed()}
      preset={{
        projectId: sp.project ? Number(sp.project) : null,
        searchId: sp.search ? Number(sp.search) : null,
      }}
    />
  );
}
