import ConnectScreen from "@/components/ConnectScreen";
import SetupNotice from "@/components/SetupNotice";
import { isDbConfigured } from "@/lib/db";
import { getGoogleStatus } from "@/lib/google";
import { getAssignment } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function ConnectPage() {
  if (!isDbConfigured()) return <SetupNotice />;

  const [status, assignment] = await Promise.all([
    getGoogleStatus(),
    getAssignment(),
  ]);

  const linkedSheet = assignment?.sheet_id
    ? { id: assignment.sheet_id, name: assignment.sheet_name, url: assignment.sheet_url }
    : null;

  return <ConnectScreen status={status} linkedSheet={linkedSheet} />;
}
