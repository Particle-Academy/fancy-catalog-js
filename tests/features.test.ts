import { describe, expect, it } from "vitest";
import { createCatalog } from "../src/index.js";
import {
  createCatalogFeatureSource,
  type FeatureGrant,
  type FeatureSource,
  type Subscription,
} from "../src/features.js";
import { makeStripeStub } from "./stripe-stub.js";

describe("createCatalogFeatureSource", () => {
  async function build() {
    const { stripe } = makeStripeStub();
    const catalog = createCatalog({ stripe });
    const product = await catalog.createProduct({ name: "Pro" });

    const useMcp = await catalog.createProductFeature({
      key: "use-mcp",
      name: "Use MCP",
      type: "boolean",
    });
    const aiTokens = await catalog.createProductFeature({
      key: "ai-tokens",
      name: "AI Tokens",
      type: "resource",
    });

    await catalog.attachFeature({
      productId: product.id,
      productFeatureId: useMcp.id,
      enabled: true,
    });
    await catalog.attachFeature({
      productId: product.id,
      productFeatureId: aiTokens.id,
      enabled: true,
      includedQuantity: 50_000,
      overageLimit: 10_000,
      config: { warnAt: 0.8 },
    });

    return { catalog, product };
  }

  it("emits FeatureGrant[] from a product's features for a subscribed subject", async () => {
    const { catalog, product } = await build();

    const sub: Subscription = { id: "sub_1", productId: product.id, status: "active" };
    const source: FeatureSource = createCatalogFeatureSource(catalog, {
      resolveSubscription: () => sub,
    });

    expect(source.name).toBe("catalog");

    const grants = (await source.grantsFor("user-42")) as FeatureGrant[];
    expect(grants).toHaveLength(2);

    const boolGrant = grants.find((g) => g.key === "use-mcp")!;
    expect(boolGrant).toMatchObject({
      key: "use-mcp",
      type: "boolean",
      enabled: true,
      includedQuantity: null,
      overageLimit: null,
      source: `catalog:${product.id}`,
    });

    const resourceGrant = grants.find((g) => g.key === "ai-tokens")!;
    expect(resourceGrant).toMatchObject({
      key: "ai-tokens",
      type: "resource",
      enabled: true,
      includedQuantity: 50_000,
      overageLimit: 10_000,
      source: `catalog:${product.id}`,
      config: { warnAt: 0.8 },
    });
  });

  it("returns [] when there is no subscription", async () => {
    const { catalog } = await build();
    const source = createCatalogFeatureSource(catalog, {
      resolveSubscription: () => null,
    });
    expect(await source.grantsFor("nobody")).toEqual([]);
  });

  it("returns [] when the subscription points at a missing product", async () => {
    const { catalog } = await build();
    const source = createCatalogFeatureSource(catalog, {
      resolveSubscription: () => ({ id: "sub_x", productId: "does-not-exist" }),
    });
    expect(await source.grantsFor("user")).toEqual([]);
  });

  it("resolves the subscription asynchronously (Promise-returning resolver)", async () => {
    const { catalog, product } = await build();
    const source = createCatalogFeatureSource(catalog, {
      resolveSubscription: async () => ({ id: "sub_async", productId: product.id }),
    });
    const grants = await source.grantsFor("user");
    expect(grants.map((g) => g.key).sort()).toEqual(["ai-tokens", "use-mcp"]);
  });
});
