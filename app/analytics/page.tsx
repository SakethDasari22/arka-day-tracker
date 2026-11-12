import AnalyticsScreen from "@/components/pipeline/AnalyticsScreen";
import SetupNotice from "@/components/SetupNotice";
import { isDbConfigured } from "@/lib/db";
import { getAnalytics } from "@/lib/pipeline-analytics";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  if (!isDbConfigured()) return <SetupNotice />;
  const data = await getAnalytics();
  return <AnalyticsScreen data={data} />;
}
