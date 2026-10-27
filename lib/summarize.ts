import { parseAssignment, type AssignmentInput } from "./queries";

export interface TaskSummary extends AssignmentInput {
  /** A one- or two-line plain summary of what's being asked. */
  summary: string;
  /** Concrete to-dos pulled from the message. */
  tasks: string[];
}

/**
 * Turn a raw email/message into a structured task. Uses the Anthropic API when
 * ANTHROPIC_API_KEY is set; otherwise falls back to a rule-based parse so the
 * feature still works without a key (just less polished).
 */
export async function summarizeTask(raw: string): Promise<TaskSummary> {
  const text = raw.trim();
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      return await summarizeWithAI(text);
    } catch {
      /* fall through to the rule-based version */
    }
  }
  return ruleBased(text);
}

function ruleBased(text: string): TaskSummary {
  const parsed = parseAssignment(text);
  // Split the message into candidate action lines.
  const tasks = text
    .split(/[\n•\-•]|(?<=\.)\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 8 && /[a-z]/i.test(s))
    .slice(0, 5);
  const summary =
    text.length > 160 ? text.slice(0, 157).trimEnd() + "…" : text;
  return {
    ...parsed,
    summary,
    tasks: tasks.length ? tasks : [parsed.title],
  };
}

async function summarizeWithAI(text: string): Promise<TaskSummary> {
  const model = process.env.ANTHROPIC_MODEL || "claude-3-5-haiku-latest";
  const prompt = `You are helping an operations intern track work. Read this message from their manager and return STRICT JSON (no prose, no markdown) with these keys:
{
  "title": short assignment title (<= 6 words),
  "summary": one or two plain sentences of what's being asked,
  "area": location/ZIP/radius if mentioned else "",
  "material": product/material if mentioned else "",
  "need": what to find/deliver if mentioned else "",
  "tasks": array of 1-5 concrete to-do strings
}

Message:
"""
${text.slice(0, 4000)}
"""`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY as string,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 600,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}`);
  const data = await res.json();
  const out = data?.content?.[0]?.text ?? "";
  const json = JSON.parse(extractJson(out));
  return {
    title: String(json.title || "Supplier research"),
    summary: String(json.summary || ""),
    area: json.area || undefined,
    material: json.material || undefined,
    need: json.need || undefined,
    raw_message: text,
    tasks: Array.isArray(json.tasks)
      ? json.tasks.map((t: unknown) => String(t)).filter(Boolean).slice(0, 5)
      : [],
  };
}

function extractJson(s: string): string {
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  return start >= 0 && end > start ? s.slice(start, end + 1) : s;
}
