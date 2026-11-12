import { NextResponse } from "next/server";
import { finderAllowed, finderConfigured, finderEngine, listSearches, runFinder } from "@/lib/finder";
import { runFreeFinder } from "@/lib/finder-free";
import type { FinderEvent, FinderInput } from "@/lib/finder-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Web research takes a few minutes. 300s is the Vercel Hobby ceiling.
export const maxDuration = 300;

export async function GET() {
  try {
    return NextResponse.json({ searches: await listSearches(15) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}

/** Runs a search and streams progress as newline-delimited JSON events. */
export async function POST(req: Request) {
  if (!finderConfigured()) {
    return NextResponse.json(
      { error: "Add GEMINI_API_KEY (free from Google AI Studio) in your environment variables to run live searches." },
      { status: 400 }
    );
  }
  if (!finderAllowed()) {
    return NextResponse.json(
      { error: "Live search is turned off on the public demo. It runs when the app is password-protected (or FINDER_PUBLIC=true)." },
      { status: 403 }
    );
  }

  const body = (await req.json()) as Record<string, unknown>;
  const product = String(body.product ?? "").trim();
  const zip = String(body.zip ?? "").trim();
  const radius = Math.round(Number(body.radius));
  const count = Math.round(Number(body.count) || 10);
  if (!product) return NextResponse.json({ error: "Enter the product you're looking for" }, { status: 400 });
  if (!/^\d{5}$/.test(zip)) return NextResponse.json({ error: "Enter a 5-digit ZIP code" }, { status: 400 });
  if (!(radius >= 10 && radius <= 1000)) {
    return NextResponse.json({ error: "Radius must be between 10 and 1,000 miles" }, { status: 400 });
  }

  const input: FinderInput = {
    product: product.slice(0, 200),
    dimensions: String(body.dimensions ?? "").trim().slice(0, 300) || undefined,
    zip,
    radius,
    count: Math.min(20, Math.max(3, count)),
    projectId: body.projectId ? Number(body.projectId) : null,
  };

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (e: FinderEvent) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
        } catch {
          /* client went away; keep going so the search still saves */
        }
      };
      // Heartbeat so proxies don't close a quiet connection.
      const beat = setInterval(() => emit({ type: "status", text: "" }), 15_000);
      try {
        await (finderEngine() === "gemini" ? runFreeFinder : runFinder)(input, emit);
      } catch (e) {
        emit({ type: "error", text: e instanceof Error ? e.message : "Search failed" });
      } finally {
        clearInterval(beat);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
