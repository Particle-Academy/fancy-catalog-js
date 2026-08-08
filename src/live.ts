import type { LiveContract } from "@particle-academy/fancy-query";

/**
 * The catalog Live Contract — which broadcast events this package emits and
 * which client query keys each one invalidates.
 *
 * Pure data, and `LiveContract` is imported as a TYPE, so this file adds no
 * dependency: a host that does not want live behaviour pays nothing for the
 * declaration being here.
 *
 * The PHP twin (`LaravelCatalog\LiveContract`) declares the identical list, and
 * a parity test on each side asserts they match. That test is what keeps the
 * pair honest — this is the failure mode where drift is invisible, because a
 * renamed event does not throw, it just leaves a cache nobody invalidated and a
 * UI that stops updating.
 *
 * @example
 * ```ts
 * import { catalogLive } from "@particle-academy/fancy-catalog";
 * import { toEchoMap, useFancyEchoInvalidation } from "@particle-academy/fancy-query";
 *
 * useFancyEchoInvalidation(catalogLive.channel, toEchoMap(catalogLive));
 * ```
 */
export const catalogLive = {
    namespace: "catalog",
    channel: "admin.products",
    events: [
        { event: "catalog.product.created", keys: [["catalog", "products"]] },
        { event: "catalog.product.updated", keys: [["catalog", "products"]] },
        { event: "catalog.product.deleted", keys: [["catalog", "products"]] },
        // A price change alters what a product costs, so both caches go stale.
        { event: "catalog.price.created", keys: [["catalog", "products"], ["catalog", "prices"]] },
        { event: "catalog.price.updated", keys: [["catalog", "products"], ["catalog", "prices"]] },
        { event: "catalog.price.deleted", keys: [["catalog", "products"], ["catalog", "prices"]] },
    ],
} as const satisfies LiveContract;
