/**
 * A ULID generator — the ids the catalog assigns when a caller supplies none.
 *
 * This was the `ulid` package until 0.6.1. ULID is a frozen spec, the generator
 * is about twenty lines, and the package fell to the suite's rule that
 * third-party code must be actively maintained; it was also this package's only
 * runtime dependency, shipped to every consumer. The Python twin already
 * generated its own (`fancy_catalog/ulid.py`); this is the same thing.
 *
 * The output is the same kind of id the package produced, so rows written
 * before and after the swap stay interchangeable: 26 characters of Crockford
 * base32 (upper case, no I/L/O/U), 48 bits of millisecond timestamp in the
 * first 10, then 80 random bits in the last 16. A string sort is a time sort.
 * `tests/ulid.test.ts` pins that against vectors the package itself produced.
 *
 * **Not monotonic within a millisecond** — neither was the package's `ulid()`
 * (only its separate `monotonicFactory`). Ids from the same millisecond sort
 * arbitrarily among themselves. Nothing here orders by id.
 *
 * Randomness comes from Web Crypto, which Node (>= 19, and this package needs
 * 22) and every browser expose as `globalThis.crypto`, so the build stays
 * platform-neutral. There is deliberately no `Math.random` fallback: an id that
 * is only as unpredictable as a PRNG is not a ULID, and the package refused to
 * fall back too.
 */

/** Crockford base32. Its order is what makes a ULID sort by time — never reorder it. */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const TIME_CHARS = 10;
const RANDOM_CHARS = 16;
const TIME_MAX = 2 ** 48 - 1;

/** A new ULID. Pass `seedTime` (ms since the epoch) only to make a test deterministic. */
export function ulid(seedTime: number = Date.now()): string {
  if (!Number.isInteger(seedTime) || seedTime < 0 || seedTime > TIME_MAX) {
    throw new RangeError(`A ULID timestamp must be an integer from 0 to ${TIME_MAX}; got ${seedTime}.`);
  }

  // Timestamps reach 2^48, past the 32 bits bitwise operators keep, so the
  // time half is peeled off with arithmetic rather than shifts.
  let time = "";
  let remaining = seedTime;
  for (let i = 0; i < TIME_CHARS; i++) {
    const digit = remaining % 32;
    time = ALPHABET[digit] + time;
    remaining = (remaining - digit) / 32;
  }

  // One byte per character, keeping its low 5 bits. 256 is a multiple of 32,
  // so every character is equally likely — no modulo bias.
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(RANDOM_CHARS));
  let random = "";
  for (const byte of bytes) random += ALPHABET[byte & 31];

  return time + random;
}
