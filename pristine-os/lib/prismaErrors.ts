// True for Prisma's unique-constraint violation (P2002). Checks the error
// code the same way callers always have, without assuming the error's class.
export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "P2002"
  );
}
