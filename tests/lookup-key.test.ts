import { describe, expect, it } from "vitest";
import { createCatalog } from "../src/index.js";
import { makeStripeStub } from "./stripe-stub.js";

/**
 * Stripe Prices support `lookup_key` NATIVELY, and a copy in metadata is not a
 * substitute: `prices.list({ lookup_keys: [...] })` reads only the real field.
 * Writing it to metadata alone produces prices that cannot be looked up by the
 * key they were given — which is the entire reason a lookup key exists.
 *
 * `transfer_lookup_key` is what makes it survive this library's own lifecycle.
 * Prices are immutable, so a changed amount archives the old price and creates a
 * replacement; without the transfer, that create fails with "lookup key already
 * exists" the first time anyone reprices something that has a key.
 *
 * The PHP twin has both, with a comment explaining exactly this. This one had
 * neither.
 */

async function syncPriceWith(lookupKey: string | null) {
    const { stripe } = makeStripeStub();
    const catalog = createCatalog({ stripe });

    const product = await catalog.createProduct({ name: "Pro", lookupKey: "pro" });
    await catalog.syncProduct(product);

    const price = await catalog.createPrice({
        productId: product.id,
        currency: "USD",
        unitAmount: 2900,
        type: "recurring",
        recurringInterval: "month",
        lookupKey,
    } as never);
    await catalog.syncPrice(price);

    return (stripe.prices.create as unknown as { mock: { calls: unknown[][] } }).mock.calls.at(-1)?.[0] as Record<
        string,
        unknown
    >;
}

describe("price lookup keys", () => {
    it("sends the native lookup_key, not just a metadata copy", async () => {
        const sent = await syncPriceWith("pro-monthly");

        expect(sent.lookup_key, "prices.list({lookup_keys}) reads only this field").toBe("pro-monthly");
    });

    it("transfers the key so repricing does not collide", async () => {
        const sent = await syncPriceWith("pro-monthly");

        expect(sent.transfer_lookup_key).toBe(true);
    });

    it("omits both when there is no key, rather than clearing one already on Stripe", async () => {
        const sent = await syncPriceWith(null);

        expect(sent).not.toHaveProperty("lookup_key");
        expect(sent).not.toHaveProperty("transfer_lookup_key");
    });
});
