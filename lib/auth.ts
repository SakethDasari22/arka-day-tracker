export const AUTH_COOKIE = "dt_auth";

/**
 * A stable token derived from the password so the cookie never stores the
 * password itself. Pure JS (no Node APIs) so it runs in Edge middleware too.
 * This is a lightweight gate for a single-user internal tool, not a security
 * boundary for secrets.
 */
export function token(password: string): string {
  let h = 2166136261;
  const salt = "arka-day-tracker";
  for (const ch of password + salt) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}
