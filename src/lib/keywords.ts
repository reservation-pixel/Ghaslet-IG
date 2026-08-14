/**
 * Accepts either an array or a comma-separated string (what the rule form
 * submits) and returns null for "no keywords", which the engine reads as a
 * catch-all rule.
 */
export function normalizeKeywords(input: unknown): string[] | null {
  if (Array.isArray(input)) {
    const cleaned = input.map(String).map((s) => s.trim()).filter(Boolean);
    return cleaned.length > 0 ? cleaned : null;
  }
  if (typeof input === "string") {
    const cleaned = input.split(",").map((s) => s.trim()).filter(Boolean);
    return cleaned.length > 0 ? cleaned : null;
  }
  return null;
}
