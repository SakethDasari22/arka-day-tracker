import { NextResponse } from "next/server";
import { getEmailText } from "@/lib/integrations";
import { summarizeTask } from "@/lib/summarize";
import { addTask, setAssignment } from "@/lib/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const messageId = String(body.messageId ?? "");
    if (!messageId) {
      return NextResponse.json({ error: "messageId required" }, { status: 400 });
    }
    const email = await getEmailText(messageId);
    const combined = `${email.subject}\n\n${email.text}`.trim();
    const summary = await summarizeTask(combined);

    const assignment = await setAssignment({
      title: summary.title,
      area: summary.area,
      material: summary.material,
      need: summary.need,
      raw_message: email.text || combined,
    });

    let created = 0;
    for (const t of summary.tasks) {
      if (t && t.trim()) {
        await addTask(t.trim(), "Gmail");
        created++;
      }
    }

    return NextResponse.json({ assignment, summary: summary.summary, tasksCreated: created });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to turn email into a task" },
      { status: 500 }
    );
  }
}
