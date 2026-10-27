import ReportScreen from "@/components/ReportScreen";
import SetupNotice from "@/components/SetupNotice";
import { isDbConfigured } from "@/lib/db";
import { getAssignment, getDayReport, getSuppliers, getTasks } from "@/lib/queries";
import { longDate } from "@/lib/date";

export const dynamic = "force-dynamic";

export default async function ReportPage() {
  if (!isDbConfigured()) return <SetupNotice />;

  const [report, assignment, tasks, suppliers] = await Promise.all([
    getDayReport(),
    getAssignment(),
    getTasks(),
    getSuppliers(),
  ]);

  return (
    <ReportScreen
      dateLong={longDate()}
      report={report}
      assignment={assignment}
      doneTaskTitles={tasks.filter((t) => t.done).map((t) => t.title)}
      openSupplierNames={suppliers.filter((s) => !s.complete).map((s) => s.company)}
    />
  );
}
