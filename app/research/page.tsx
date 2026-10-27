import ResearchScreen from "@/components/ResearchScreen";
import SetupNotice from "@/components/SetupNotice";
import { isDbConfigured } from "@/lib/db";
import { getAssignment, getSuppliers } from "@/lib/queries";
import { getGoogleStatus } from "@/lib/google";

export const dynamic = "force-dynamic";

export default async function ResearchPage() {
  if (!isDbConfigured()) return <SetupNotice />;

  const [assignment, suppliers, google] = await Promise.all([
    getAssignment(),
    getSuppliers(),
    getGoogleStatus(),
  ]);

  return (
    <ResearchScreen
      assignment={assignment}
      suppliers={suppliers}
      googleConnected={google.connected}
    />
  );
}
