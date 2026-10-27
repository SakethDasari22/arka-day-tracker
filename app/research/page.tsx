import ResearchScreen from "@/components/ResearchScreen";
import SetupNotice from "@/components/SetupNotice";
import { isDbConfigured } from "@/lib/db";
import { getAssignment, getSuppliers } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function ResearchPage() {
  if (!isDbConfigured()) return <SetupNotice />;

  const [assignment, suppliers] = await Promise.all([
    getAssignment(),
    getSuppliers(),
  ]);

  return <ResearchScreen assignment={assignment} suppliers={suppliers} />;
}
