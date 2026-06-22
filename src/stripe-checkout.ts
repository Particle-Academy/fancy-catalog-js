/**
 * StripeCheckout — the Node port of the PHP `StripeCheckoutService`.
 * Builds Stripe Checkout sessions via `checkout.sessions.create`. The PHP
 * Cashier "owner" (a Billable) becomes a plain `customer` id the caller
 * supplies (the app maps its user → Stripe customer). Returns the session
 * (including `.url`).
 */

import type Stripe from "stripe";
import type { Price } from "./types.js";

/** Common args for both checkout flows. */
export interface CheckoutArgs {
  /**
   * The Stripe customer id (the Cashier "owner" analog). Optional — when
   * omitted, Stripe Checkout collects a new customer at the hosted page.
   */
  customer?: string;
  successUrl: string;
  cancelUrl: string;
  /** Extra metadata merged onto the subscription/payment metadata. */
  metadata?: Record<string, string>;
}

export interface OneTimeCheckoutArgs extends CheckoutArgs {
  quantity: number;
}

export class StripeCheckout {
  constructor(private readonly stripe: Stripe) {}

  /**
   * Create a Checkout session for a recurring subscription.
   * Port of `subscriptionCheckout()`.
   */
  async subscriptionCheckout(price: Price, args: CheckoutArgs): Promise<Stripe.Checkout.Session> {
    const stripePriceId = price.externalId;
    if (!stripePriceId) {
      throw new Error(
        "Price does not have a Stripe price ID. Sync the price to Stripe first.",
      );
    }
    if (price.type !== "recurring") {
      throw new Error("Cannot create subscription checkout for a one-time price.");
    }

    const params: Stripe.Checkout.SessionCreateParams = {
      mode: "subscription",
      line_items: [{ price: stripePriceId, quantity: 1 }],
      success_url: args.successUrl,
      cancel_url: args.cancelUrl,
      subscription_data: {
        metadata: {
          price_id: String(price.id),
          product_id: String(price.productId),
          ...(args.metadata ?? {}),
        },
      },
    };

    if (args.customer) {
      params.customer = args.customer;
    }

    // Trial period (the PHP `trialDays()`).
    if (price.recurringTrialPeriodDays) {
      params.subscription_data!.trial_period_days = price.recurringTrialPeriodDays;
    }

    return this.stripe.checkout.sessions.create(params);
  }

  /**
   * Create a Checkout session for a one-time payment (add-on purchase).
   * Port of `oneTimeCheckout()`.
   */
  async oneTimeCheckout(
    price: Price,
    args: OneTimeCheckoutArgs,
  ): Promise<Stripe.Checkout.Session> {
    const stripePriceId = price.externalId;
    if (!stripePriceId) {
      throw new Error(
        "Price does not have a Stripe price ID. Sync the price to Stripe first.",
      );
    }
    if (price.type !== "one_time") {
      throw new Error("Cannot create one-time checkout for a recurring price.");
    }

    const baseMetadata = {
      price_id: String(price.id),
      product_id: String(price.productId),
    };

    const params: Stripe.Checkout.SessionCreateParams = {
      mode: "payment",
      line_items: [{ price: stripePriceId, quantity: args.quantity }],
      success_url: args.successUrl,
      cancel_url: args.cancelUrl,
      payment_intent_data: {
        metadata: { ...baseMetadata, ...(args.metadata ?? {}) },
      },
      invoice_creation: {
        enabled: true,
        invoice_data: { metadata: { ...baseMetadata } },
      },
    };

    if (args.customer) {
      params.customer = args.customer;
    }

    return this.stripe.checkout.sessions.create(params);
  }

  /** Convenience: the subscription Checkout session URL. Port of `getSubscriptionCheckoutUrl()`. */
  async getSubscriptionCheckoutUrl(price: Price, args: CheckoutArgs): Promise<string> {
    const session = await this.subscriptionCheckout(price, args);
    return session.url ?? "";
  }

  /** Convenience: the one-time Checkout session URL. Port of `getOneTimeCheckoutUrl()`. */
  async getOneTimeCheckoutUrl(price: Price, args: OneTimeCheckoutArgs): Promise<string> {
    const session = await this.oneTimeCheckout(price, args);
    return session.url ?? "";
  }
}
