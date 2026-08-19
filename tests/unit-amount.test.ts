import { describe, expect, it } from "vitest";

import { createCatalog } from "../src/catalog";
import { sameAmount } from "../src/stripe-catalog-sync";
import { makeStripeStub } from "./stripe-stub";

/**
 * A price may have NO unit amount, and null is not zero.
 *
 * Stripe sets none on a `tiered` or `custom_unit_amount` price — the tiers carry
 * the money. This package models `tiers`, `tiersMode` and `customUnitAmount`,
 * sends them, and compares them on the way back, and then typed `unitAmount` as
 * `number`, which made every one of them unrepresentable.
 *
 * The comparison matters as much as the type. Prices are immutable, so
 * "changed" archives the live price and creates a replacement — a churned id and
 * orphaned references, silently.
 */
describe("sameAmount", () => {
  it("treats two equal amounts as unchanged", () => {
    expect(sameAmount(1999, 1999)).toBe(true);
  });

  it("sees a real price change", () => {
    expect(sameAmount(1999, 2499)).toBe(false);
  });

  it("does not confuse 'no unit amount' with 'free'", () => {
    // A tiered price has null; a free price has 0. Treating them as equal leaves
    // a tiered price un-updated, or archives a free one for nothing.
    expect(sameAmount(null, 0)).toBe(false);
    expect(sameAmount(0, null)).toBe(false);
  });

  it("treats two tiered prices as unchanged", () => {
    expect(sameAmount(null, null)).toBe(true);
    expect(sameAmount(undefined, null)).toBe(true);
  });
});

describe("a tiered price", () => {
  it("is sent to Stripe with NO unit_amount field at all", async () => {
    const { stub, stripe } = makeStripeStub();
    const catalog = createCatalog({ stripe });
    const product = await catalog.createProduct({ name: "Metered", externalId: "prod_x" });

    const price = await catalog.createPrice({
      productId: product.id,
      currency: "USD",
      // The whole point: no unit amount at all.
      unitAmount: null,
      type: "recurring",
      recurringInterval: "month",
      billingScheme: "tiered",
      tiersMode: "graduated",
      tiers: [
        { up_to: 1000, unit_amount: 0 },
        { up_to: "inf", unit_amount: 1 },
      ],
    });

    await catalog.syncPrice(price);

    const arg = stub.prices.create.mock.calls[0]![0];
    // Not `unit_amount: null`, and emphatically not `unit_amount: 0` — the key
    // must be ABSENT. Sending it alongside `tiers` is an API error; sending 0
    // would be a free price, silently.
    expect("unit_amount" in arg).toBe(false);
    expect(arg.billing_scheme).toBe("tiered");
    expect(arg.tiers).toHaveLength(2);
  });

  it("is not re-created on a second sync just because both sides have no amount", async () => {
    const { stub, stripe } = makeStripeStub({
      retrievePrice: {
        id: "price_old",
        unit_amount: null,
        currency: "usd",
        billing_scheme: "tiered",
        tiers_mode: "graduated",
        tiers: [
          { up_to: 1000, unit_amount: 0 },
          { up_to: "inf", unit_amount: 1 },
        ],
        recurring: { interval: "month", interval_count: 1, usage_type: "licensed" },
      },
    });
    const catalog = createCatalog({ stripe });
    const product = await catalog.createProduct({ name: "Metered", externalId: "prod_x" });

    const price = await catalog.createPrice({
      productId: product.id,
      externalId: "price_old",
      currency: "USD",
      unitAmount: null,
      type: "recurring",
      recurringInterval: "month",
      billingScheme: "tiered",
      tiersMode: "graduated",
      tiers: [
        { up_to: 1000, unit_amount: 0 },
        { up_to: "inf", unit_amount: 1 },
      ],
    });

    await catalog.syncPrice(price);

    // A false "changed" here archives a live price and churns its id.
    expect(stub.prices.create).not.toHaveBeenCalled();
  });
});
