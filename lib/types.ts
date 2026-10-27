export type TaskStatus = "todo" | "progress" | "done";

export interface Assignment {
  id: number;
  day: string;
  title: string;
  area: string | null;
  material: string | null;
  need: string | null;
  raw_message: string | null;
}

export interface Task {
  id: number;
  day: string;
  title: string;
  tag: string | null;
  status: TaskStatus;
  done: boolean;
  sort: number;
}

export type SupplierType = "Manufacturer" | "Distributor";

export interface Supplier {
  id: number;
  day: string;
  company: string;
  type: SupplierType;
  contact: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  location: string | null;
}

export interface LogEntry {
  id: number;
  day: string;
  text: string;
  tag: string | null;
  minutes: number | null;
  created_at: string;
}

/** A supplier with the completeness flags the UI needs. */
export interface SupplierView extends Supplier {
  complete: boolean;
}
