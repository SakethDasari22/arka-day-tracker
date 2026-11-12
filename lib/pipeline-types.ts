/**
 * Types and stage definitions for the sourcing pipeline. Safe to import from
 * client components (no server code here).
 *
 * The pipeline mirrors how a project actually runs at Arka:
 *   client request -> supplier research -> quotes -> pick the best ->
 *   sample to client -> client approval -> bulk order -> delivered.
 * Arka sits in the middle, so neither side ever sees the other.
 */

export type ProjectStatus = "active" | "on_hold" | "lost" | "done";

export type OutreachOutcome =
  | "waiting"
  | "no_reply"
  | "declined"
  | "quoting"
  | "quoted";

export type SampleDecision = "pending" | "approved" | "rejected";

/** The eight checkpoints a project moves through, in order. */
export const STAGES = [
  { key: "received_on", label: "Request received", short: "Request" },
  { key: "first_contact_on", label: "Supplier research", short: "Research" },
  { key: "first_quote_on", label: "Quotes in", short: "Quotes" },
  { key: "sample_requested_on", label: "Best quote picked", short: "Picked" },
  { key: "sample_sent_on", label: "Sample sent to client", short: "Sample" },
  { key: "approved_on", label: "Client approved", short: "Approved" },
  { key: "ordered_on", label: "Bulk order placed", short: "Ordered" },
  { key: "delivered_on", label: "Delivered to client", short: "Delivered" },
] as const;

export type StageKey = (typeof STAGES)[number]["key"];

export interface ProjectRow {
  id: number;
  client: string;
  product: string;
  quantity: number | null;
  unit: string | null;
  specs: string | null;
  target_price: string | null;
  deadline: string | null;
  received_on: string;
  status: ProjectStatus;
  notes: string | null;
  // Stage dates (null until reached)
  first_contact_on: string | null;
  first_quote_on: string | null;
  sample_requested_on: string | null;
  sample_sent_on: string | null;
  approved_on: string | null;
  ordered_on: string | null;
  delivered_on: string | null;
  // Counters
  suppliers_contacted: number;
  suppliers_replied: number;
  quotes_count: number;
  /** 0-based index into STAGES of the furthest stage reached. */
  stage_index: number;
  days_to_deadline: number | null;
}

export interface OutreachRow {
  id: number;
  project_id: number;
  supplier: string;
  supplier_type: string | null;
  location: string | null;
  state: string | null;
  contact: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  channel: string | null;
  contacted_on: string;
  replied_on: string | null;
  outcome: OutreachOutcome;
  notes: string | null;
  days_waiting: number | null;
}

export interface QuoteRow {
  id: number;
  project_id: number;
  outreach_id: number;
  supplier: string;
  state: string | null;
  unit_price: string;
  moq: number | null;
  lead_time_days: number | null;
  spec_match: number;
  shipping_cost: string | null;
  quoted_on: string;
  valid_until: string | null;
  shortlisted: boolean;
  notes: string | null;
  // From the scoring view
  effective_price: string;
  score: string;
  score_rank: number;
  price_score: string;
  lead_score: string;
  moq_score: string;
  spec_score: string;
  moq_ok: boolean | null;
}

export interface SampleRow {
  id: number;
  project_id: number;
  quote_id: number;
  supplier: string;
  unit_price: string;
  requested_on: string;
  sent_on: string | null;
  decision: SampleDecision;
  decided_on: string | null;
  feedback: string | null;
}

export interface OrderRow {
  id: number;
  project_id: number;
  quote_id: number;
  supplier: string;
  quantity: number | null;
  unit_price: string | null;
  ordered_on: string;
  shipped_on: string | null;
  delivered_on: string | null;
  tracking: string | null;
  notes: string | null;
}

export interface ProjectDetail {
  project: ProjectRow;
  outreach: OutreachRow[];
  quotes: QuoteRow[];
  samples: SampleRow[];
  orders: OrderRow[];
}

export const OUTCOME_LABEL: Record<OutreachOutcome, string> = {
  waiting: "Waiting",
  no_reply: "No reply",
  declined: "Declined",
  quoting: "Quote coming",
  quoted: "Quoted",
};

export const STATUS_LABEL: Record<ProjectStatus, string> = {
  active: "Active",
  on_hold: "On hold",
  lost: "Lost",
  done: "Done",
};

/** Weights behind the supplier score. Shown in the UI so the method is visible. */
export const SCORE_WEIGHTS = {
  price: 40,
  lead: 25,
  spec: 20,
  moq: 15,
} as const;
