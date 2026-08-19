# AGENTS.md — fancy-catalog (Node/TS)

The Node twin of `particle-academy/laravel-catalog`: a Stripe catalog —
products, prices, plans, checkout — framework-free.

This file describes **this repository's code**. Process rules — publishing,
versioning, backports, the support lifecycle — live in the envelope's
`AGENTS.md` and are deliberately not repeated here, because a copy in a repo
freezes at whatever the rule was when the branch was cut.

## The one concept to hold

**A plan is a Product with a recurring Price. There is no Plan model.** Every
product needs at least one price before it can sync.

Stores are injected (`InMemoryProductStore` and friends ship for tests); the
package owns no persistence.

## Prices are immutable, and that shapes everything

Stripe will not let you edit a price's amount. So a pricing change means:
archive the existing price (`active: false`) and create a replacement. That is
why `pricingChanged()` matters more than it looks — a false positive there
**churns a live price id** and orphans whatever referenced it, silently.

Traps that have already cost something:

- **Key order is not a pricing change.** `transform_quantity` and
  `custom_unit_amount` are objects, and the two sides come from different places
  — Stripe returns its own key order, we build ours. Compare them with
  `sameShape`, never as JSON strings. `tiers` is a *list*, so its order **is**
  meaningful and stays compared in order.

- **`lookup_key` must be sent natively, not just in metadata.**
  `prices.list({ lookup_keys: [...] })` reads only the real field — which is the
  entire reason a lookup key exists. Send `transfer_lookup_key` with it, or the
  first reprice of anything with a key fails with *"lookup key already exists"*.
  Send neither when there is no key: passing null clears a key already on Stripe.

- **`unitAmount` is `number | null`, and null is not zero.** A tiered or
  custom-amount price has no unit amount — Stripe sets none, the tiers carry the
  money. It must be OMITTED from the payload rather than sent as null (an API
  error alongside `tiers`) or as 0 (a free price). Compare amounts with
  `sameAmount`, never `!==`: null vs undefined is not a price change, and a
  false change archives a live price.

- **`syncPrice`'s `catch` recreates the price.** It is there for a price deleted
  out from under us, but it will also swallow a genuine API error and create a
  duplicate. Be careful what you let throw inside it.

## Features

`fancy-features` owns the `FeatureSource` contract; this package mirrors it and
re-exports from `./features`. The contract changes there first.

`overageLimit` is a **ceiling** on billable consumption past
`includedQuantity`, honoured by `fancy-features` 0.5.0+. This package only
populates it from the pivot; the semantics live over there.

## Parity

The PHP twin is the reference for behaviour; where they disagree, that is a
finding, not a choice — and both have been wrong together at least once. Money
arithmetic belongs in `fancy-conformance` as a fixture row, not in prose:
integer minor units throughout, never floats.

## Testing

`npm test` (vitest). **No network, ever** — Stripe is driven through
`tests/stripe-stub.ts`. Note the stub's price field is `externalId`; a test that
sets something else silently takes the create-from-scratch branch and proves
nothing.
