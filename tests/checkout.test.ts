import { describe, expect, it } from "vitest";
import { createCatalog } from "../src/index.js";
import { makeStripeStub } from "./stripe-stub.js";

async function setup() {
  const { stub, stripe } = makeStripeStub();
  const catalog = createCatalog({ stripe });
  const product = await catalog.createProduct({ name: "Pro", externalId: "prod_x" });
  return { stub, catalog, product };
}

describe("StripeCheckout payload shapes", () => {
  it("builds a subscription session with subscription_data.metadata + trial", async () => {
    const { stub, catalog, product } = await setup();
    const price = await catalog.createPrice({
      productId: product.id,
      externalId: "price_sub",
      currency: "USD",
      unitAmount: 2900,
      type: "recurring",
      recurringInterval: "month",
      recurringTrialPeriodDays: 14,
      pricingModel: "flat_recurring",
    });

    const session = await catalog.subscriptionCheckout(price, {
      customer: "cus_123",
      successUrl: "https://app/success",
      cancelUrl: "https://app/cancel",
      metadata: { campaign: "launch" },
    });

    expect(session.url).toBeTruthy();
    const arg = stub.checkout.sessions.create.mock.calls[0]![0];
    expect(arg.mode).toBe("subscription");
    expect(arg.customer).toBe("cus_123");
    expect(arg.line_items).toEqual([{ price: "price_sub", quantity: 1 }]);
    expect(arg.subscription_data.metadata).toMatchObject({
      price_id: price.id,
      product_id: product.id,
      campaign: "launch",
    });
    expect(arg.subscription_data.trial_period_days).toBe(14);
  });

  it("builds a one-time session with payment_intent_data + invoice_creation", async () => {
    const { stub, catalog, product } = await setup();
    const price = await catalog.createPrice({
      productId: product.id,
      externalId: "price_once",
      currency: "USD",
      unitAmount: 5000,
      type: "one_time",
      pricingModel: "flat_one_time",
    });

    await catalog.oneTimeCheckout(price, {
      quantity: 3,
      successUrl: "https://app/success",
      cancelUrl: "https://app/cancel",
    });

    const arg = stub.checkout.sessions.create.mock.calls[0]![0];
    expect(arg.mode).toBe("payment");
    expect(arg.line_items).toEqual([{ price: "price_once", quantity: 3 }]);
    expect(arg.payment_intent_data.metadata).toMatchObject({
      price_id: price.id,
      product_id: product.id,
    });
    expect(arg.invoice_creation.enabled).toBe(true);
    expect(arg.invoice_creation.invoice_data.metadata).toMatchObject({
      price_id: price.id,
      product_id: product.id,
    });
  });

  it("rejects a subscription checkout for a one-time price (and vice versa)", async () => {
    const { catalog, product } = await setup();
    const oneTime = await catalog.createPrice({
      productId: product.id,
      externalId: "price_o",
      currency: "USD",
      unitAmount: 5000,
      type: "one_time",
    });
    await expect(
      catalog.subscriptionCheckout(oneTime, { successUrl: "s", cancelUrl: "c" }),
    ).rejects.toThrow(/one-time price/);

    const recurring = await catalog.createPrice({
      productId: product.id,
      externalId: "price_r",
      currency: "USD",
      unitAmount: 2900,
      type: "recurring",
      recurringInterval: "month",
    });
    await expect(
      catalog.oneTimeCheckout(recurring, { quantity: 1, successUrl: "s", cancelUrl: "c" }),
    ).rejects.toThrow(/recurring price/);
  });

  it("throws when the price has no Stripe price id", async () => {
    const { catalog, product } = await setup();
    const price = await catalog.createPrice({
      productId: product.id,
      currency: "USD",
      unitAmount: 2900,
      type: "recurring",
      recurringInterval: "month",
    });
    await expect(
      catalog.subscriptionCheckout(price, { successUrl: "s", cancelUrl: "c" }),
    ).rejects.toThrow(/Sync the price to Stripe first/);
  });

  it("getSubscriptionCheckoutUrl returns the session url", async () => {
    const { catalog, product } = await setup();
    const price = await catalog.createPrice({
      productId: product.id,
      externalId: "price_url",
      currency: "USD",
      unitAmount: 2900,
      type: "recurring",
      recurringInterval: "month",
    });
    const url = await catalog.getSubscriptionCheckoutUrl(price, {
      successUrl: "s",
      cancelUrl: "c",
    });
    expect(url).toBe("https://checkout.stripe.test/session");
  });
});
