import { describe, expect, it } from "vitest";
import { createCatalog, InMemoryProductStore } from "../src/index.js";
import { makeStripeStub } from "./stripe-stub.js";

describe("Catalog CRUD (in-memory stores)", () => {
  it("creates and finds products, prices, and features (soft-delete aware)", async () => {
    const { stripe } = makeStripeStub();
    const catalog = createCatalog({ stripe });

    const product = await catalog.createProduct({ name: "Pro", lookupKey: "pro" });
    expect(product.id).toBeTruthy();
    expect(product.active).toBe(true);
    expect(await catalog.products.find(product.id)).toEqual(product);

    const price = await catalog.createPrice({
      productId: product.id,
      currency: "USD",
      unitAmount: 2900,
      type: "recurring",
      recurringInterval: "month",
      pricingModel: "flat_recurring",
    });
    expect(await catalog.prices.forProduct(product.id)).toHaveLength(1);
    expect(price.unitAmount).toBe(2900);

    const feature = await catalog.createProductFeature({
      key: "use-mcp",
      name: "Use MCP",
      type: "boolean",
    });
    await catalog.attachFeature({
      productId: product.id,
      productFeatureId: feature.id,
      enabled: true,
    });
    const pfcs = await catalog.productFeatures.forProduct(product.id);
    expect(pfcs).toHaveLength(1);
    expect(pfcs[0]!.feature.key).toBe("use-mcp");
    expect(pfcs[0]!.enabled).toBe(true);

    // Soft delete hides the product from default reads.
    await catalog.products.remove(product.id);
    expect(await catalog.products.find(product.id)).toBeNull();
    expect(await catalog.products.find(product.id, { withTrashed: true })).not.toBeNull();
  });

  it("seeds stores via the store option", async () => {
    const { stripe } = makeStripeStub();
    const seeded = new InMemoryProductStore([
      { id: "p1", name: "Seeded", active: true },
    ]);
    const catalog = createCatalog({ stripe, store: { products: seeded } });
    expect(await catalog.products.find("p1")).toMatchObject({ name: "Seeded" });
  });
});
