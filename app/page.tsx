import TodayScreen from "@/components/TodayScreen";
import SetupNotice from "@/components/SetupNotice";
import { isDbConfigured } from "@/lib/db";
import { getAssignment, getLog, getSuppliers, getTasks } from "@/lib/queries";
import { longDate } from "@/lib/date";

export const dynamic = "force-dynamic";

export default async function TodayPage() {
  if (!isDbConfigured()) return <SetupNotice />;

  const [assignment, tasks, log, suppliers] = await Promise.all([
    getAssignment(),
    getTasks(),
    getLog(),
    getSuppliers(),
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
    />
  );
}
