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
