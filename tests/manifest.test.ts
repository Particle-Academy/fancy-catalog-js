import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * The manifest has to agree with the code about what this package needs.
 *
 * `stripe` was declared a NON-optional peer while every reference to it in
 * source is `import type` — the SDK is injected by the host and never bundled,
 * which this package's own docblock already called an "optional-but-expected
 * peer dependency".
 *
 * A required peer that is never runtime-imported is not a documentation
 * quibble. npm auto-installs non-optional peers, and `npm ci` REFUSES a tree
 * whose lockfile lacks one — so it surfaced as a consumer's clean install
 * failing with `Missing: stripe@22.5.0 from lock file`, in an app that does not
 * touch Stripe from JavaScript at all.
 *
 * Three things have to stay in step — the import style, the docblock, and the
 * manifest — and only the manifest is load-bearing for someone else's install.
 */
const pkg = JSON.parse(
  readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8"),
) as {
  peerDependencies?: Record<string, string>;
  peerDependenciesMeta?: Record<string, { optional?: boolean }>;
};

describe("peer dependencies", () => {
  it("declares stripe as OPTIONAL, because it is only ever a type import", () => {
    expect(pkg.peerDependencies?.stripe).toBeDefined();
    expect(pkg.peerDependenciesMeta?.stripe?.optional).toBe(true);
  });

  it("keeps every peer this package does not runtime-import optional", () => {
    // The general rule, so the next peer added does not repeat this. A peer is
    // required only when importing this package without it would throw, and a
    // type-only reference never can.
    for (const name of Object.keys(pkg.peerDependencies ?? {})) {
      expect(
        pkg.peerDependenciesMeta?.[name]?.optional,
        `peer "${name}" is required — it must be runtime-imported, or marked optional`,
      ).toBe(true);
    }
  });
});
