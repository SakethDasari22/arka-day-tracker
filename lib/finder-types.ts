/** Shared between the finder engine (server) and the Find suppliers page. */

export interface FinderInput {
  product: string;
  dimensions?: string;
  zip: string;
  radius: number; // miles, 10–1000
  count: number; // how many qualifying suppliers to aim for
  projectId?: number | null;
}

export interface FinderResult {
  company: string;
  website: string;
  type: string;
  city: string;
  state: string;
  zip: string;
  distance_miles: number | null;
  contact_person: string;
  contact_title: string;
  email: string;
  email_type: "personal" | "generic" | "";
  phone: string;
  contact_form_url: string;
  product_available: "yes" | "no" | "unclear";
  /** Where each value was read, so nothing is taken on trust. */
  sources: {
    active?: string;
    product?: string;
    person?: string;
    email?: string;
    phone?: string;
  };
  notes: string;
}

export type FinderEvent =
  | { type: "status"; text: string }
  | { type: "origin"; city: string; state: string }
  | { type: "search"; query: string }
  | { type: "candidates"; total: number; inRange: number }
  | { type: "checking"; company: string }
  | { type: "result"; result: FinderResult }
  | { type: "dropped"; company: string; reason: string }
  | { type: "done"; searchId: number | null; results: FinderResult[]; summary: string }
  | { type: "error"; text: string };

export interface SavedSearch {
  id: number;
  product: string;
  dimensions: string | null;
  zip: string;
  radius_miles: number;
  project_id: number | null;
  status: string;
  summary: string | null;
  results: FinderResult[];
  created_at: string;
}

export const RADIUS_OPTIONS = [25, 50, 100, 250, 500, 1000] as const;
