// Test helpers shared by the integration tests.

// Unwraps a value the test expects to exist (e.g. a row it just created),
// failing with a clear message instead of a TypeError later on.
export function must<T>(value: T | null | undefined, what = "value"): T {
  if (value === null || value === undefined) {
    throw new Error(`Expected ${what} to exist`);
  }
  return value;
}
