/*
 * Prisma's case-insensitive `equals`/`contains` on PostgreSQL compile to
 * ILIKE, where "%" and "_" in the value are wildcards and "\" is the escape
 * character. Escape them so user input (a typed or scanned code) is always
 * matched literally.
 */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}
