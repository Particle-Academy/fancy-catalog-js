/**
 * Catalog / createCatalog — the Node port of the PHP `CatalogManager` (+ the
 * facade). A unified, headless interface over the stores + Stripe sync +
 * checkout services. Stripe is INJECTED; persistence is behind store
 * adapters (in-memory by default).
 */

import type Stripe from "stripe";
import { ulid } from "ulid";
import type {
  ConnectionTestResult,
  Price,
  Product,
  ProductFeature,
  ProductFeatureConfig,
} from "./types.js";
import {
  InMemoryPriceStore,
  InMemoryProductFeatureStore,
  InMemoryProductStore,
  type PriceStore,
  type ProductFeatureStore,
  type ProductStore,
} from "./stores.js";
import { StripeCatalogSync, type CatalogLogger } from "./stripe-catalog-sync.js";
import {
  StripeCheckout,
  type CheckoutArgs,
  type OneTimeCheckoutArgs,
} from "./stripe-checkout.js";

export interface CatalogStores {
  products?: ProductStore;
  prices?: PriceStore;
  productFeatures?: ProductFeatureStore;
}

export interface CreateCatalogOptions {
  /** A configured `Stripe` instance from the `stripe` SDK (injected, never bundled). */
  stripe: Stripe;
  /** Plug your own DB-backed stores; defaults to in-memory. */
  store?: CatalogStores;
  /** Optional error logger (defaults to no-op). */
  logger?: CatalogLogger;
  /**
   * Optional hook fired after a product + its prices finish syncing — the Node
   * analog of the PHP `ProductSyncedToStripe` event / `SyncProductToStripe` job.
   */
  onProductSynced?: (productId: string) => void | Promise<void>;
}

export class Catalog {
  readonly products: ProductStore;
  readonly prices: PriceStore;
  readonly productFeatures: ProductFeatureStore;

  private readonly sync: StripeCatalogSync;
  private readonly checkout: StripeCheckout;
  private readonly onProductSynced?: (productId: string) => void | Promise<void>;

  constructor(opts: CreateCatalogOptions) {
    this.products = opts.store?.products ?? new InMemoryProductStore();
    this.prices = opts.store?.prices ?? new InMemoryPriceStore();
    this.productFeatures =
      opts.store?.productFeatures ?? new InMemoryProductFeatureStore();
    this.onProductSynced = opts.onProductSynced;

    this.sync = new StripeCatalogSync({
      stripe: opts.stripe,
      products: this.products,
      prices: this.prices,
      logger: opts.logger,
    });
    this.checkout = new StripeCheckout(opts.stripe);
  }

  // ---- Stripe sync (port of CatalogManager) ----

  syncProduct(product: Product): Promise<Product> {
    return this.sync.syncProduct(product);
  }

  syncPrice(price: Price): Promise<Price> {
    return this.sync.syncPrice(price);
  }

  async syncProductAndPrices(product: Product): Promise<Product> {
    const result = await this.sync.syncProductAndPrices(product);
    // Stamp last_synced_at on the product + its prices (the PHP job did this).
    const now = new Date();
    result.lastSyncedAt = now;
    await this.products.save(result);
    for (const price of await this.prices.forProduct(result.id)) {
      price.lastSyncedAt = now;
      await this.prices.save(price);
    }
    await this.onProductSynced?.(result.id);
    return result;
  }

  testConnection(): Promise<ConnectionTestResult> {
    return this.sync.testConnection();
  }

  // ---- Checkout (port of CatalogManager) ----

  subscriptionCheckout(price: Price, args: CheckoutArgs): Promise<Stripe.Checkout.Session> {
    return this.checkout.subscriptionCheckout(price, args);
  }

  oneTimeCheckout(price: Price, args: OneTimeCheckoutArgs): Promise<Stripe.Checkout.Session> {
    return this.checkout.oneTimeCheckout(price, args);
  }

  getSubscriptionCheckoutUrl(price: Price, args: CheckoutArgs): Promise<string> {
    return this.checkout.getSubscriptionCheckoutUrl(price, args);
  }

  getOneTimeCheckoutUrl(price: Price, args: OneTimeCheckoutArgs): Promise<string> {
    return this.checkout.getOneTimeCheckoutUrl(price, args);
  }

  // ---- Authoring helpers (terse CRUD over the stores; ULIDs auto-assigned) ----

  async createProduct(
    input: Omit<Product, "id" | "active"> & Partial<Pick<Product, "id" | "active">>,
  ): Promise<Product> {
    const product: Product = {
      active: true,
      order: 0,
      ...input,
      id: input.id ?? ulid(),
      createdAt: input.createdAt ?? new Date(),
      updatedAt: new Date(),
    };
    return this.products.save(product);
  }

  async createPrice(
    input: Omit<Price, "id" | "active"> & Partial<Pick<Price, "id" | "active">>,
  ): Promise<Price> {
    const price: Price = {
      active: true,
      order: 0,
      ...input,
      id: input.id ?? ulid(),
      createdAt: input.createdAt ?? new Date(),
      updatedAt: new Date(),
    };
    return this.prices.save(price);
  }

  async createProductFeature(
    input: Omit<ProductFeature, "id"> & Partial<Pick<ProductFeature, "id">>,
  ): Promise<ProductFeature> {
    const feature: ProductFeature = {
      ...input,
      id: input.id ?? ulid(),
      createdAt: input.createdAt ?? new Date(),
      updatedAt: new Date(),
    };
    return this.productFeatures.save(feature);
  }

  /** Attach a feature to a product with pivot data (the `product_feature_configs` row). */
  async attachFeature(
    input: Omit<ProductFeatureConfig, "id"> & Partial<Pick<ProductFeatureConfig, "id">>,
  ): Promise<ProductFeatureConfig> {
    const config: ProductFeatureConfig = {
      ...input,
      enabled: input.enabled ?? false,
      id: input.id ?? ulid(),
      createdAt: input.createdAt ?? new Date(),
      updatedAt: new Date(),
    };
    return this.productFeatures.setConfig(config);
  }
}

export function createCatalog(opts: CreateCatalogOptions): Catalog {
  return new Catalog(opts);
}
