import { describe, expect, it } from "vitest";
import { createCatalog } from "../src/index.js";
import { makeStripeStub } from "./stripe-stub.js";

/**
 * Key order is not a pricing change.
 *
 * `pricingChanged()` compared `transform_quantity` and `custom_unit_amount` by
 * JSON string. Those are OBJECTS, and the two sides come from different places:
 * Stripe returns its own key order, we build ours. Identical pricing with the
 * keys in a different order compared unequal, so the sync archived a live price
 * and created a replacement — churning price ids, orphaning anything that
 * referenced the old one, and doing it silently.
 *
 * `tiers` is deliberately still compared in order: it is an array, where order
 * is part of the meaning.
 */

async function syncTwice(first: Record<string, unknown>, second: Record<string, unknown>) {
    const { stripe } = makeStripeStub({
        retrievePrice: {
            id: "price_existing",
            unit_amount: 2900,
            currency: "usd",
            billing_scheme: "per_unit",
            recurring: { interval: "month", interval_count: 1, usage_type: "licensed" },
            ...first,
        },
    } as never);
    const catalog = createCatalog({ stripe });

    const product = await catalog.createProduct({ name: "Pro" });
    await catalog.syncProduct(product);

    const price = await catalog.createPrice({
        productId: product.id,
        currency: "USD",
        unitAmount: 2900,
        type: "recurring",
        recurringInterval: "month",
        externalId: "price_existing",
        ...second,
    } as never);
    await catalog.syncPrice(price);

    return (stripe.prices.create as unknown as { mock: { calls: unknown[][] } }).mock.calls.length;
}

describe("pricing change detection", () => {
    it("does not replace a price when only the key order differs", async () => {
        const created = await syncTwice(
            { transform_quantity: { divide_by: 10, round: "up" } },
            { transformQuantity: { round: "up", divide_by: 10 } },
        );

        expect(created, "the same pricing in a different key order is not a change").toBe(0);
    });
});
