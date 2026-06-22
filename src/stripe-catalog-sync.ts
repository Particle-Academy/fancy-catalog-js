/**
 * StripeCatalogSync — the Node port of the PHP `StripeCatalogService`.
 * Syncs Products and Prices to Stripe via an INJECTED `Stripe` instance
 * (the `stripe` SDK is an optional-but-expected peer dependency; never
 * bundled here). Preserves the PHP semantics exactly:
 *   - products.create / products.update (+ external_id capture)
 *   - prices are IMMUTABLE: change detection re-creates a new price and
 *     archives the old (`active: false`); the shared internal `price_id`
 *     ULID rides in metadata so archived + replacement prices stay linked.
 */

import type Stripe from "stripe";
import type { Price, Product, ConnectionTestResult } from "./types.js";
import type { PriceStore, ProductStore } from "./stores.js";

/** A logger sink; defaults to no-op (PHP used Laravel's Log facade). */
export interface CatalogLogger {
  error(message: string, context?: Record<string, unknown>): void;
}

const noopLogger: CatalogLogger = { error() {} };

export interface StripeCatalogSyncOptions {
  stripe: Stripe;
  products: ProductStore;
  prices: PriceStore;
  logger?: CatalogLogger;
}

export class StripeCatalogSync {
  private readonly stripe: Stripe;
  private readonly products: ProductStore;
  private readonly prices: PriceStore;
  private readonly logger: CatalogLogger;

  constructor(opts: StripeCatalogSyncOptions) {
    this.stripe = opts.stripe;
    this.products = opts.products;
    this.prices = opts.prices;
    this.logger = opts.logger ?? noopLogger;
  }

  /**
   * Sync a Product to Stripe — create or update the Stripe Product and
   * capture its id into `externalId`. Port of `syncProduct()`.
   */
  async syncProduct(product: Product): Promise<Product> {
    try {
      const stripeProductData: Stripe.ProductCreateParams = {
        name: product.name,
        active: product.active,
        metadata: {
          ...stringifyMetadata(product.metadata),
          product_id: product.id,
          // Stripe Products do not support lookup keys directly; store in metadata.
          product_lookup_key: product.lookupKey ?? "",
        },
      };

      if (product.description) {
        stripeProductData.description = product.description;
      }
      if (product.statementDescriptor) {
        stripeProductData.statement_descriptor = product.statementDescriptor;
      }
      if (product.unitLabel) {
        stripeProductData.unit_label = product.unitLabel;
      }
      if (product.images && product.images.length > 0) {
        stripeProductData.images = product.images;
      }

      if (product.externalId) {
        await this.stripe.products.update(product.externalId, stripeProductData);
      } else {
        const stripeProduct = await this.stripe.products.create(stripeProductData);
        product.externalId = stripeProduct.id;
        await this.products.save(product);
      }

      return product;
    } catch (e) {
      this.logger.error("Stripe product sync failed", {
        product_id: product.id,
        error: errorMessage(e),
      });
      throw e;
    }
  }

  /**
   * Test the Stripe connection by listing products. Port of `testConnection()`.
   * Returns a generic failure message — never leaks raw Stripe API errors.
   */
  async testConnection(): Promise<ConnectionTestResult> {
    try {
      const products = await this.stripe.products.list({ limit: 10 });
      const count = products.data.length;
      return {
        success: true,
        message: `Success! Connected to Stripe. Found ${count} product(s) in your Stripe account.`,
        productCount: count,
      };
    } catch (e) {
      this.logger.error("catalog.stripe.test_connection_failed", {
        message: errorMessage(e),
      });
      return {
        success: false,
        message: "Could not reach Stripe. Check your API credentials and try again.",
      };
    }
  }

  /**
   * Sync a Price to Stripe. Prices are immutable, so a pricing change archives
   * the old price (`active: false`) and creates a new one. Port of `syncPrice()`.
   */
  async syncPrice(price: Price): Promise<Price> {
    try {
      // Ensure the product is synced first (need its externalId).
      const product = await this.products.find(price.productId);
      if (!product) {
        throw new Error(`Price ${price.id} references missing product ${price.productId}.`);
      }
      if (!product.externalId) {
        await this.syncProduct(product);
      }

      const stripePriceData = this.buildPriceData(price, product);

      if (price.externalId) {
        try {
          const existing = await this.stripe.prices.retrieve(price.externalId);

          if (this.pricingChanged(existing, price, stripePriceData)) {
            // Archive old (immutable) price, then create the replacement.
            await this.stripe.prices.update(price.externalId, { active: false });
            const created = await this.stripe.prices.create(stripePriceData);
            price.externalId = created.id;
            await this.prices.save(price);
          } else {
            // Only metadata / active status changed.
            await this.stripe.prices.update(price.externalId, {
              active: price.active,
              metadata: stripePriceData.metadata,
            });
          }
        } catch {
          // Price doesn't exist in Stripe anymore — recreate it.
          const created = await this.stripe.prices.create(stripePriceData);
          price.externalId = created.id;
          await this.prices.save(price);
        }
      } else {
        const created = await this.stripe.prices.create(stripePriceData);
        price.externalId = created.id;
        await this.prices.save(price);
      }

      return price;
    } catch (e) {
      this.logger.error("Stripe price sync failed", {
        price_id: price.id,
        error: errorMessage(e),
      });
      throw e;
    }
  }

  /** Sync a Product and all of its (non-trashed) Prices. Port of `syncProductAndPrices()`. */
  async syncProductAndPrices(product: Product): Promise<Product> {
    await this.syncProduct(product);
    const prices = await this.prices.forProduct(product.id);
    for (const price of prices) {
      await this.syncPrice(price);
    }
    return (await this.products.find(product.id)) ?? product;
  }

  /** Build the Stripe price create/compare payload (port of the PHP `$stripePriceData`). */
  private buildPriceData(price: Price, product: Product): Stripe.PriceCreateParams {
    const data: Stripe.PriceCreateParams = {
      product: product.externalId ?? undefined,
      currency: price.currency.toLowerCase(),
      unit_amount: price.unitAmount,
      active: price.active,
      metadata: {
        ...stringifyMetadata(price.metadata),
        // Shared internal ULID linking archived + replacement Stripe prices.
        price_id: price.id,
        product_id: price.productId,
        lookup_key: price.lookupKey ?? "",
      },
    };

    if (price.billingScheme) {
      data.billing_scheme = price.billingScheme;
    }
    if (price.billingScheme === "tiered" && price.tiers) {
      data.tiers = price.tiers as unknown as Stripe.PriceCreateParams.Tier[];
      if (price.tiersMode) {
        data.tiers_mode = price.tiersMode;
      }
    }
    if (price.transformQuantity) {
      data.transform_quantity = price.transformQuantity;
    }
    if (price.customUnitAmount) {
      const cua = price.customUnitAmount;
      data.custom_unit_amount = {
        enabled: cua.enabled,
        ...(cua.maximum != null ? { maximum: cua.maximum } : {}),
        ...(cua.minimum != null ? { minimum: cua.minimum } : {}),
        ...(cua.preset != null ? { preset: cua.preset } : {}),
      };
    }

    if (price.type === "recurring") {
      const usageType: "metered" | "licensed" =
        price.pricingModel === "usage_recurring" ? "metered" : "licensed";
      data.recurring = {
        interval: (price.recurringInterval ?? "month") as Stripe.PriceCreateParams.Recurring.Interval,
        interval_count: price.recurringIntervalCount ?? 1,
        usage_type: usageType,
      };
      if (price.recurringTrialPeriodDays) {
        data.recurring.trial_period_days = price.recurringTrialPeriodDays;
      }
    }

    return data;
  }

  /**
   * Detect whether a pricing change requires a new (immutable) Stripe price.
   * Mirrors the PHP `$pricingChanged` comparison exactly: unit_amount,
   * currency, recurring interval/count/usage_type, billing_scheme, tiers_mode,
   * tiers, transform_quantity, custom_unit_amount.
   */
  private pricingChanged(
    existing: Stripe.Price,
    price: Price,
    data: Stripe.PriceCreateParams,
  ): boolean {
    if (existing.unit_amount !== price.unitAmount) return true;
    if (existing.currency !== price.currency.toLowerCase()) return true;

    if (price.type === "recurring") {
      const desired = data.recurring;
      if (existing.recurring?.interval !== desired?.interval) return true;
      if (existing.recurring?.interval_count !== (desired?.interval_count ?? 1)) return true;
      const existingUsage = existing.recurring?.usage_type ?? "licensed";
      const desiredUsage = desired?.usage_type ?? "licensed";
      if (existingUsage !== desiredUsage) return true;
    }

    if ((existing.billing_scheme ?? "per_unit") !== (data.billing_scheme ?? "per_unit")) {
      return true;
    }
    if ((existing.tiers_mode ?? null) !== (data.tiers_mode ?? null)) return true;

    if (
      JSON.stringify((existing as { tiers?: unknown }).tiers ?? []) !==
      JSON.stringify(data.tiers ?? [])
    ) {
      return true;
    }
    if (
      JSON.stringify(existing.transform_quantity ?? {}) !==
      JSON.stringify(data.transform_quantity ?? {})
    ) {
      return true;
    }
    if (
      JSON.stringify(existing.custom_unit_amount ?? {}) !==
      JSON.stringify(data.custom_unit_amount ?? {})
    ) {
      return true;
    }

    return false;
  }
}

/** Stripe metadata values must be strings; coerce arbitrary metadata. */
function stringifyMetadata(
  metadata: Record<string, unknown> | null | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!metadata) return out;
  for (const [k, v] of Object.entries(metadata)) {
    if (v == null) continue;
    out[k] = typeof v === "string" ? v : JSON.stringify(v);
  }
  return out;
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
