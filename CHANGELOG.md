# Changelog

Notable changes to `@particle-academy/fancy-catalog`.

**BREAKING** marks anything that can stop working on upgrade. This package is
pre-1.0, so breaking changes land in MINOR releases — read those entries before
upgrading.

> Entries below **1.0** were reconstructed from git history when this file was
> introduced, so they summarise commit subjects rather than consumer impact.
> Everything from the next release onward is written by hand, in the same commit
> as the change.

---

## [Unreleased]

### Fixed

- **`CHANGELOG.md` is now in the published tarball.** `files` did not whitelist it, so npm never shipped it — and this package puts breaking changes in MINOR releases and tells you in the README to read the entry before taking one. The instruction existed for the author, who has the file, and not for the consumer, who is the only one being instructed. Nothing for you to do; the file simply arrives from this release on.

### Security

- `source-map-js` is pinned forward to `^1.2.2` via `overrides`. Versions up to
  1.2.1 allow an event-loop denial of service through indexed source-map section
  offsets, and it arrives here transitively through the build toolchain.
  **Nothing for a consumer to do, and no runtime change**: an npm package does
  not ship a lockfile, so this governs builds OF this repo, not anything
  installed FROM it. Recorded rather than left silent because the override it
  sits beside — `shell-quote` `^1.9.0`, added for an earlier advisory — was
  carried with no note of why, and had drifted back inside the vulnerable range
  before anyone looked.

## 0.6.1 — 2026-09-13

### Removed

- **The `ulid` dependency.** It was this package's only runtime dependency, so
  every consumer installed it, and its upstream (ulid/javascript) last released
  on 2025-11-30 — past the suite's rule that third-party code must be actively
  maintained. The ids `createProduct`, `createPrice`, `createProductFeature` and
  `attachFeature` assign when you pass no `id` now come from a first-party
  generator in `src/ulid.ts`, the same one the Python twin already had.

  **They are the same kind of id.** 26 characters of upper-case Crockford
  base32, the millisecond timestamp in the first 10, 80 random bits in the last
  16, sorting by time as a string. `tests/ulid.test.ts` was written against the
  package first and passed there, and pins the new code against vectors the
  package itself produced — including whole ids it generated — so ids already
  in your store interleave with new ones in time order. Like the package's
  `ulid()`, it is not monotonic within a single millisecond.

  **What you must do:** nothing. The generator is internal, no export changed,
  and ids you pass explicitly are kept as before. If your own code imported
  `ulid` and relied on this package to install it, add it to your own
  dependencies.

## 0.6.0 — 2026-08-19

Matches `laravel-catalog` 0.13.0. Full argument:
`.ai/plans/fancy-commerce-gating-rulings.md`.

### Fixed

- **BREAKING (types only): a tiered price could not be represented.**
  `Price.unitAmount` was typed `number`, and Stripe sets **no** unit amount on a
  `tiered` or `custom_unit_amount` price — the tiers carry the money. This
  package models `tiers`, `tiersMode` and `customUnitAmount`, sends them, and
  compares them on the way back, and then made every one of them impossible one
  field away.

  `unitAmount` is now `number | null`, and it is **omitted from the Stripe
  payload entirely** when null — not sent as `null`, which is an API error
  alongside `tiers`, and emphatically not as `0`, which is a free price.

  **What to do:** nothing at runtime — an existing price with a number still
  behaves identically. **TypeScript will flag every place you read
  `price.unitAmount` as a number**, which is the point: those places now have a
  case they did not have before. Narrow with `?? 0` only where a missing amount
  genuinely means free, which for a tiered price it does not.

- **`pricingChanged` compared unit amounts with `!==`.** Prices are immutable, so
  "changed" means archive the live price and create a replacement — a churned
  price id and orphaned references, silently. With `null` now a real value, a
  strict comparison against `undefined` (a price object built without the field)
  reads as a change on every sync. Amounts go through the new exported
  `sameAmount()`, which treats `null` and `undefined` as the same absence and
  keeps both distinct from `0`.

  Same class of fix as the key-order comparison in 0.5.0, on a scalar.

### Changed

- **`FeatureGrant.overageLimit` now means something**, in the package that owns
  the contract. It was "soft cap before block" in a comment and nothing in code.
  It is a **ceiling** on billable consumption past `includedQuantity`, honoured
  by `@particle-academy/fancy-features` 0.5.0. This package's job is unchanged:
  it populates the field from the pivot. *No consumer action.*

## 0.5.0 - 2026-08-18

### Fixed

- **Key order was treated as a pricing change, archiving live prices for
  nothing.** `transform_quantity` and `custom_unit_amount` were compared as JSON
  strings. Both are objects, and the two sides come from different places -
  Stripe returns its own key order, this library builds its own - so identical
  pricing compared unequal. Prices are immutable, so "changed" means archive the
  old one and create a replacement: a churned price id, anything referencing the
  old one orphaned, and no indication it happened.

  Both are now compared without regard to key order. `tiers` deliberately stays
  order-sensitive, because it is an array and its order is part of the meaning.


## 0.4.0 — 2026-08-18

### Fixed

- **Prices were synced without Stripe's native `lookup_key`, so they could not
  be looked up by it.** The key was written into `metadata` only, and metadata
  is not a substitute: `prices.list({ lookup_keys: [...] })` reads the real
  field and nothing else — which is the entire reason a lookup key exists. Every
  price this library synced was unfindable by the key it was given.

  `transfer_lookup_key` is now sent with it. Stripe prices are immutable, so a
  changed amount archives the old price and creates a replacement; without the
  transfer, that create fails with *"lookup key already exists"* the first time
  anyone reprices something that has a key.

  Both are sent only when a key is set — passing null would clear a key already
  on the Stripe price.

  The PHP twin has had both, with a comment explaining exactly this. This is the
  Node side catching up.

  **What to do:** prices synced before this release carry the key in metadata
  only. Re-syncing them attaches the real field.


## [0.3.2] - 2026-08-12

### Fixed

- **`stripe` is now an OPTIONAL peer dependency.** It was declared
  `optional: false` while every reference to it in source is `import type` — the
  SDK is injected by the host and never bundled, which this package's own
  docblock already described as "optional-but-expected".

  That mismatch broke consumers' clean installs. npm auto-installs non-optional
  peers, and `npm ci` REFUSES a tree whose lockfile lacks one, so an app that
  never touches Stripe from JavaScript failed with
  `Missing: stripe@22.5.0 from lock file`.

  **What to do:** nothing, unless you were relying on this package to pull the
  Stripe SDK in for you. If you use the Stripe-backed paths — `syncCatalog`,
  `createCheckoutSession` — you were already passing a configured `Stripe`
  instance, and you install `stripe` yourself as you always did.

  A test now fails if any peer this package does not runtime-import is marked
  required.


## 0.3.1 — 2026-08-09

### Fixed

- **The Live Contract parity test never ran in CI.** It compares this package's
  contract against `LaravelCatalog\LiveContract`, reading the PHP source — from a
  hard-coded `../../laravel-catalog/`, which resolves only inside the `.agi`
  envelope. In CI the repo is not checked out, the read failed, and every
  assertion hit `if (php === null) return;` and passed having compared nothing.

  Now: CI checks out `laravel-catalog`, the path comes from `CATALOG_PHP_SRC`
  (sibling path as fallback), and a missing twin **throws in CI** rather than
  returning early. Locally a skip is still right — in CI it is a hole.

  Verified in three states: correct path passes, a bad path under `CI=1` fails 4
  of 7 cases, and a bad path without `CI` still skips.

## 0.3.0 — 2026-08-07

### Added

- **`catalogLive` — this package's Live Contract.** Pure data declaring which
  broadcast events the catalog emits and which client query keys each one
  invalidates, so a host can wire live updates without hand-maintaining an
  event→key map that drifts from the backend.

  ```ts
  import { catalogLive } from "@particle-academy/fancy-catalog";
  import { toEchoMap, useFancyEchoInvalidation } from "@particle-academy/fancy-query";

  useFancyEchoInvalidation(catalogLive.channel, toEchoMap(catalogLive));
  ```

  `fancy-query` is a **type-only** import here, so this adds no dependency —
  a host that does not want live behaviour pays nothing for the declaration.

  `LaravelCatalog\LiveContract` declares the identical list, and a parity test
  on each side asserts they match. That test is the point: drift between a
  mirror pair is silent, because a renamed event does not throw — the browser
  listens for a name nobody broadcasts and the UI quietly stops updating.

  **What you must do:** nothing. Additive.


## 0.2.0 — 2026-08-07

### Changed

- **BREAKING — Node 18 is no longer supported.** `engines.node` moves from `>=18` to `>=22`.

  **What you must do:** on Node 22 or newer, nothing. Note npm only *warns* on an `engines` mismatch while **pnpm fails the install**, so this surfaces differently depending on your package manager. Node 18 is end-of-life and 20 is maintenance-only.

### Why

These are the kit 0.5 platform floors, applied across every package at once so a consumer never has to resolve a mix. **No API changed, nothing was removed, nothing was renamed** — only what the package requires.


## 0.1.1 — 2026-07-04

- Maintenance only (3 internal commits).

## 0.1.0 — 2026-06-23

### Added

- initial commit — @particle-academy/fancy-catalog (Node/TS mirror of laravel-catalog)
