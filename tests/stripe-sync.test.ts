import { describe, expect, it } from "vitest";
import { createCatalog } from "../src/index.js";
import { makeStripeStub } from "./stripe-stub.js";

describe("StripeCatalogSync", () => {
  it("creates a Stripe product and captures the external id", async () => {
    const { stub, stripe } = makeStripeStub();
    const catalog = createCatalog({ stripe });
    const product = await catalog.createProduct({ name: "Pro", lookupKey: "pro" });

    const synced = await catalog.syncProduct(product);

    expect(stub.products.create).toHaveBeenCalledTimes(1);
    expect(stub.products.update).not.toHaveBeenCalled();
    expect(synced.externalId).toBeTruthy();
    // metadata carries internal ids + lookup key
    const arg = stub.products.create.mock.calls[0]![0];
    expect(arg.metadata.product_id).toBe(product.id);
    expect(arg.metadata.product_lookup_key).toBe("pro");
  });

  it("updates an existing Stripe product instead of recreating", async () => {
    const { stub, stripe } = makeStripeStub();
    const catalog = createCatalog({ stripe });
    const product = await catalog.createProduct({ name: "Pro", externalId: "prod_existing" });

    await catalog.syncProduct(product);
    expect(stub.products.update).toHaveBeenCalledWith("prod_existing", expect.anything());
    expect(stub.products.create).not.toHaveBeenCalled();
  });

  it("creates a new Stripe price when none exists", async () => {
    const { stub, stripe } = makeStripeStub();
    const catalog = createCatalog({ stripe });
    const product = await catalog.createProduct({ name: "Pro", externalId: "prod_x" });
    const price = await catalog.createPrice({
      productId: product.id,
      currency: "USD",
      unitAmount: 2900,
      type: "recurring",
      recurringInterval: "month",
      pricingModel: "flat_recurring",
    });

    const synced = await catalog.syncPrice(price);
    expect(stub.prices.create).toHaveBeenCalledTimes(1);
    const arg = stub.prices.create.mock.calls[0]![0];
    expect(arg.unit_amount).toBe(2900);
    expect(arg.currency).toBe("usd");
    expect(arg.recurring).toMatchObject({ interval: "month", interval_count: 1, usage_type: "licensed" });
    expect(arg.metadata.price_id).toBe(price.id); // shared ULID rides in metadata
    expect(synced.externalId).toBeTruthy();
  });

  it("re-creates an immutable price + archives the old one when pricing changes", async () => {
    // existing Stripe price is $29; our price is now $39 → change detected
    const { stub, stripe } = makeStripeStub({
      retrievePrice: {
        id: "price_old",
        unit_amount: 2900,
        currency: "usd",
        billing_scheme: "per_unit",
        recurring: { interval: "month", interval_count: 1, usage_type: "licensed" },
      },
    });
    const catalog = createCatalog({ stripe });
    const product = await catalog.createProduct({ name: "Pro", externalId: "prod_x" });
    const price = await catalog.createPrice({
      productId: product.id,
      externalId: "price_old",
      currency: "USD",
      unitAmount: 3900, // changed
      type: "recurring",
      recurringInterval: "month",
      pricingModel: "flat_recurring",
    });

    const synced = await catalog.syncPrice(price);

    // archived old price
    expect(stub.prices.update).toHaveBeenCalledWith("price_old", { active: false });
    // created replacement
    expect(stub.prices.create).toHaveBeenCalledTimes(1);
    expect(synced.externalId).not.toBe("price_old");
  });

  it("only updates metadata/active when pricing is unchanged", async () => {
    const { stub, stripe } = makeStripeStub({
      retrievePrice: {
        id: "price_same",
        unit_amount: 2900,
        currency: "usd",
        billing_scheme: "per_unit",
        recurring: { interval: "month", interval_count: 1, usage_type: "licensed" },
      },
    });
    const catalog = createCatalog({ stripe });
    const product = await catalog.createProduct({ name: "Pro", externalId: "prod_x" });
    const price = await catalog.createPrice({
      productId: product.id,
      externalId: "price_same",
      currency: "USD",
      unitAmount: 2900, // unchanged
      type: "recurring",
      recurringInterval: "month",
      pricingModel: "flat_recurring",
    });

    const synced = await catalog.syncPrice(price);

    expect(stub.prices.create).not.toHaveBeenCalled();
    expect(stub.prices.update).toHaveBeenCalledTimes(1);
    const [id, data] = stub.prices.update.mock.calls[0]!;
    expect(id).toBe("price_same");
    expect(data).toHaveProperty("metadata");
    expect(data.active).toBe(true);
    expect(synced.externalId).toBe("price_same"); // unchanged
  });

  it("detects a usage_type change (licensed → metered)", async () => {
    const { stub, stripe } = makeStripeStub({
      retrievePrice: {
        id: "price_u",
        unit_amount: 2900,
        currency: "usd",
        billing_scheme: "per_unit",
        recurring: { interval: "month", interval_count: 1, usage_type: "licensed" },
      },
    });
    const catalog = createCatalog({ stripe });
    const product = await catalog.createProduct({ name: "Pro", externalId: "prod_x" });
    const price = await catalog.createPrice({
      productId: product.id,
      externalId: "price_u",
      currency: "USD",
      unitAmount: 2900,
      type: "recurring",
      recurringInterval: "month",
      pricingModel: "usage_recurring", // → metered
    });

    await catalog.syncPrice(price);
    expect(stub.prices.update).toHaveBeenCalledWith("price_u", { active: false });
    expect(stub.prices.create).toHaveBeenCalledTimes(1);
  });

  it("syncProductAndPrices stamps lastSyncedAt and fires onProductSynced", async () => {
    const { stripe } = makeStripeStub();
    const synced: string[] = [];
    const catalog = createCatalog({ stripe, onProductSynced: (id) => void synced.push(id) });
    const product = await catalog.createProduct({ name: "Pro" });
    await catalog.createPrice({
      productId: product.id,
      currency: "USD",
      unitAmount: 2900,
      type: "recurring",
      recurringInterval: "month",
      pricingModel: "flat_recurring",
    });

    const result = await catalog.syncProductAndPrices(product);
    expect(result.lastSyncedAt).toBeInstanceOf(Date);
    expect(synced).toEqual([product.id]);
    const prices = await catalog.prices.forProduct(product.id);
    expect(prices[0]!.lastSyncedAt).toBeInstanceOf(Date);
  });

  it("testConnection returns a friendly success result", async () => {
    const { stripe } = makeStripeStub();
    const catalog = createCatalog({ stripe });
    const result = await catalog.testConnection();
    expect(result.success).toBe(true);
    expect(result.productCount).toBe(2);
  });
});
