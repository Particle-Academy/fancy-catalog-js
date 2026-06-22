/**
 * @particle-academy/fancy-catalog
 *
 * The framework-agnostic Node/TypeScript mirror of the PHP
 * `particle-academy/laravel-catalog`. A headless Stripe catalog: products,
 * prices, plans, checkout — with persistence behind store adapters and the
 * `stripe` SDK injected (optional-but-expected peer dependency).
 *
 * The `./features` subpath exposes the catalog as a `FeatureSource` for
 * `@particle-academy/fancy-features` (see `./features`).
 */

export * from "./types.js";
export * from "./stores.js";
export { StripeCatalogSync } from "./stripe-catalog-sync.js";
export type { CatalogLogger, StripeCatalogSyncOptions } from "./stripe-catalog-sync.js";
export { StripeCheckout } from "./stripe-checkout.js";
export type { CheckoutArgs, OneTimeCheckoutArgs } from "./stripe-checkout.js";
export { Catalog, createCatalog } from "./catalog.js";
export type { CatalogStores, CreateCatalogOptions } from "./catalog.js";
