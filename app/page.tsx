import TodayScreen from "@/components/TodayScreen";
import SetupNotice from "@/components/SetupNotice";
import { isDbConfigured } from "@/lib/db";
import { getAssignment, getLog, getSuppliers, getTasks } from "@/lib/queries";
import { getGoogleStatus } from "@/lib/google";
import { longDate } from "@/lib/date";

export const dynamic = "force-dynamic";

export default async function TodayPage() {
  if (!isDbConfigured()) return <SetupNotice />;

  const [assignment, tasks, log, suppliers, google] = await Promise.all([
    getAssignment(),
    getTasks(),
    getLog(),
    getSuppliers(),
    getGoogleStatus(),
  ]);

  return (
    <TodayScreen
      userName={process.env.NEXT_PUBLIC_USER_NAME || "Saketh"}
      dateLong={longDate()}
      assignment={assignment}
      tasks={tasks}
      log={log}
      suppliersTotal={suppliers.length}
      suppliersWithEmail={suppliers.filter((s) => s.email).length}
      googleConnected={google.connected}
    />
  );
}
