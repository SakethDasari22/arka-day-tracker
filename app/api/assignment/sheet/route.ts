import { NextResponse } from "next/server";
import { setAssignmentSheet } from "@/lib/queries";
import { sheetIdFromUrl } from "@/lib/integrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    // Unlink
    if (body.clear) {
      const a = await setAssignmentSheet(null);
      return NextResponse.json({ assignment: a });
    }
    // From the Drive picker we get id/name/url directly.
    let id: string | null = body.id ?? null;
    let url: string = body.url ?? "";
    const name: string = body.name ?? "Linked sheet";
    // Or the user pasted a URL/id.
    if (!id && body.sheetUrl) {
      id = sheetIdFromUrl(String(body.sheetUrl));
      url = String(body.sheetUrl);
    }
    if (!id) {
      return NextResponse.json(
        { error: "Couldn't read a Google Sheet id from that." },
        { status: 400 }
      );
    }
    if (!url) url = `https://docs.google.com/spreadsheets/d/${id}`;
    const assignment = await setAssignmentSheet({ id, name, url });
    return NextResponse.json({ assignment });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to link sheet" },
      { status: 500 }
    );
  }
}
