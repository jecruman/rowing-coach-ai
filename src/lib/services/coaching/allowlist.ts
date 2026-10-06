/**
 * Whether `email` is in a comma-separated allowlist (case-insensitive, whitespace-trimmed).
 * An unset or empty allowlist, or a missing email, allows nobody.
 */
export function isEmailAllowed(email: string | undefined, allowlist: string | undefined): boolean {
  if (!email || !allowlist) {
    return false;
  }
  const allowed = allowlist
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
  return allowed.includes(email.trim().toLowerCase());
}
