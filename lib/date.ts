const TZ = process.env.APP_TIMEZONE || "America/Chicago";

/** e.g. "Monday, October 26" in the app's timezone. */
export function longDate(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: TZ,
  }).format(d);
}

/** e.g. "Mon, Oct 26". */
export function shortDate(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: TZ,
  }).format(d);
}

/** e.g. "2026-10-26" in the app's timezone, for filenames. */
export function isoDate(d: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: TZ,
  }).format(d);
  return parts;
}
