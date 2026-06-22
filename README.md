# @particle-academy/fancy-catalog

[![Fancy UI suite](art/fancy-ui.svg)](https://particle.academy)

Headless **Stripe catalog** — products, prices, plans, and checkout — with a
pluggable feature source. The framework-agnostic Node/TypeScript mirror of the
PHP [`particle-academy/laravel-catalog`](https://github.com/Particle-Academy/laravel-catalog).
Same models, same Stripe sync semantics, **zero framework assumption**:
persistence is behind store adapters (in-memory by default) and the `stripe`
SDK is injected.

```ts
import Stripe from "stripe";
import { createCatalog } from "@particle-academy/fancy-catalog";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const catalog = createCatalog({ stripe }); // in-memory stores by default

const product = await catalog.createProduct({ name: "Pro Plan" });
const price = await catalog.createPrice({
  productId: product.id,
  currency: "USD",
  unitAmount: 2900, // cents
  type: "recurring",
  recurringInterval: "month",
  pricingModel: "flat_recurring",
});

// Push the product + its prices to Stripe (immutable-price re-creation on change).
await catalog.syncProductAndPrices(product);

// Hosted Checkout (the Cashier "owner" becomes a Stripe customer id you supply).
const session = await catalog.subscriptionCheckout(price, {
  customer: "cus_123",
  successUrl: "https://app.example/success",
  cancelUrl: "https://app.example/pricing",
});
// → session.url
```

## API

### `.` (default subpath)

- **`createCatalog({ stripe, store?, logger?, onProductSynced? })` → `Catalog`**
  - stores: `catalog.products` / `catalog.prices` / `catalog.productFeatures`
  - authoring: `createProduct` / `createPrice` / `createProductFeature` / `attachFeature`
  - Stripe sync: `syncProduct` / `syncPrice` / `syncProductAndPrices` / `testConnection`
  - checkout: `subscriptionCheckout` / `oneTimeCheckout` / `getSubscriptionCheckoutUrl` / `getOneTimeCheckoutUrl`
- **`StripeCatalogSync`** — products `create`/`update`; prices `create`/`update`/`retrieve` with
  **immutable-price re-creation + change detection** (compares unit_amount, currency, recurring
  interval/count/usage_type, billing_scheme, tiers_mode, tiers, transform_quantity,
  custom_unit_amount), archiving the old price (`active: false`) and carrying the shared `price_id`
  ULID in metadata.
- **`StripeCheckout`** — `checkout.sessions.create` for subscription (`subscription_data.metadata` +
  `trial_period_days`) and one-time (`payment_intent_data.metadata` + `invoice_creation`).
- **Stores** — `ProductStore` / `PriceStore` / `ProductFeatureStore` interfaces + soft-delete-aware
  in-memory defaults (`InMemoryProductStore`, …).
- **Types** — `Product`, `Price`, `ProductFeature`, `ProductFeatureConfig` (match the PHP migration
  columns/casts).

### `./features` subpath

- **`createCatalogFeatureSource(catalog, { resolveSubscription })` → `FeatureSource`** — maps a
  subject → subscription → product → product-feature pivot rows into `FeatureGrant[]`. Mirrors the
  `FeatureType` / `FeatureGrant` / `FeatureSource` contract from
  `@particle-academy/fancy-features` (canonical) verbatim — no runtime dependency on it.

```ts
import { createCatalogFeatureSource } from "@particle-academy/fancy-catalog/features";
import { createFeatures } from "@particle-academy/fancy-features";

const features = createFeatures({
  sources: [createCatalogFeatureSource(catalog, { resolveSubscription })],
  usage: myUsageStore,
});
await features.canAccess("use-mcp", user);
await features.remaining("ai-tokens", user);
```

## Stripe is injected

`stripe` is an optional-but-expected **peer dependency** — pass your own
configured `Stripe` instance. `@particle-academy/fancy-features` is an
**optional** peer (structural typing only; never imported at runtime), so this
package is fully standalone.

---

## ⭐ Star Fancy UI

If this package is useful to you, a quick ⭐ on the repo really helps us build a better kit. Thank you!
