/**
 * Catalog domain types — the headless mirror of the PHP `laravel-catalog`
 * Eloquent models (Product / Price / ProductFeature) and the
 * `product_feature_configs` pivot. Columns/casts match the migrations:
 *   - 2024_01_01_000001_create_products_table
 *   - 2024_01_01_000002_create_prices_table
 *   - 2024_01_01_000003_create_product_features_table
 *   - 2024_01_01_000004_create_product_feature_configs_table
 *
 * Money is integer minor units (cents), mirroring Stripe + the PHP
 * `unit_amount`. IDs are strings (ULIDs in PHP).
 */

/** Price billing type — the PHP `Price::TYPE_*` constants. */
export type PriceType = "recurring" | "one_time";

/**
 * Supported pricing models — the PHP `Price::PRICING_MODEL_*` constants.
 * Encodes the Stripe-style pricing configuration for this price.
 */
export type PricingModel =
  | "flat_recurring"
  | "per_seat_recurring"
  | "tiered_recurring"
  | "usage_recurring"
  | "flat_one_time"
  | "package_one_time"
  | "customer_choice_one_time";

/** Feature kind — the PHP `product_features.type` column. */
export type ProductFeatureType = "boolean" | "resource";

/** Stripe `billing_scheme`. */
export type BillingScheme = "per_unit" | "tiered";

/** Stripe `tiers_mode`. */
export type TiersMode = "graduated" | "volume";

/** A single Stripe price tier (passed through verbatim to the Stripe SDK). */
export interface PriceTier {
  up_to: number | "inf" | null;
  unit_amount?: number | null;
  unit_amount_decimal?: string | null;
  flat_amount?: number | null;
  flat_amount_decimal?: string | null;
}

/** Stripe `transform_quantity` config. */
export interface TransformQuantity {
  divide_by: number;
  round: "up" | "down";
}

/** Stripe `custom_unit_amount` config. */
export interface CustomUnitAmount {
  enabled: boolean;
  maximum?: number | null;
  minimum?: number | null;
  preset?: number | null;
}

/**
 * Product — mirrors Stripe's Product + the PHP `products` table.
 * Soft-deletes preserve financial history (the PHP `SoftDeletes` trait).
 */
export interface Product {
  id: string;
  name: string;
  description?: string | null;
  active: boolean;
  /** Array of image URLs (the PHP `images` json column). */
  images?: string[] | null;
  metadata?: Record<string, unknown> | null;
  statementDescriptor?: string | null;
  unitLabel?: string | null;
  /** Stripe product id (the PHP `external_id`). */
  externalId?: string | null;
  /** Stable, human-readable identifier (the PHP `lookup_key`). */
  lookupKey?: string | null;
  /** Display ordering. */
  order?: number;
  lastSyncedAt?: Date | null;
  createdAt?: Date | null;
  updatedAt?: Date | null;
  /** Soft-delete timestamp (null/undefined = live). */
  deletedAt?: Date | null;
}

/**
 * Price — mirrors Stripe's Price + the PHP `prices` table.
 * Prices are immutable in Stripe; soft-deletes mirror Stripe archiving.
 */
export interface Price {
  id: string;
  productId: string;
  active: boolean;
  /** ISO-4217 currency, e.g. "USD". */
  currency: string;
  /** Price in cents (the PHP `unit_amount`). */
  unitAmount: number;
  type: PriceType;
  pricingModel?: PricingModel | null;

  // Recurring subscription fields (null for one-time prices)
  recurringInterval?: string | null; // "month" | "year" | ...
  recurringIntervalCount?: number | null; // default 1
  recurringTrialPeriodDays?: number | null;

  // Advanced Stripe pricing
  billingScheme?: BillingScheme | null;
  tiers?: PriceTier[] | null;
  tiersMode?: TiersMode | null;
  transformQuantity?: TransformQuantity | null;
  customUnitAmount?: CustomUnitAmount | null;

  nickname?: string | null;
  lookupKey?: string | null;
  metadata?: Record<string, unknown> | null;
  /** Stripe price id (the PHP `external_id`). */
  externalId?: string | null;
  order?: number;
  lastSyncedAt?: Date | null;
  createdAt?: Date | null;
  updatedAt?: Date | null;
  deletedAt?: Date | null;
}

/**
 * ProductFeature — the catalog of billable features (the PHP
 * `product_features` table). `key` is unique.
 */
export interface ProductFeature {
  id: string;
  key: string;
  name: string;
  description?: string | null;
  type: ProductFeatureType;
  config?: Record<string, unknown> | null;
  createdAt?: Date | null;
  updatedAt?: Date | null;
}

/**
 * ProductFeatureConfig — the `product_feature_configs` pivot resolving one
 * ProductFeature for one Product (enabled / quotas / overage / config).
 */
export interface ProductFeatureConfig {
  id: string;
  productId: string;
  productFeatureId: string;
  enabled: boolean;
  includedQuantity?: number | null;
  overageLimit?: number | null;
  config?: Record<string, unknown> | null;
  createdAt?: Date | null;
  updatedAt?: Date | null;
}

/**
 * A pivot row joined to its ProductFeature — what `productFeatures.forProduct`
 * returns, and what `createCatalogFeatureSource` maps into `FeatureGrant[]`.
 */
export interface ProductFeatureWithConfig {
  feature: ProductFeature;
  enabled: boolean;
  includedQuantity?: number | null;
  overageLimit?: number | null;
  config?: Record<string, unknown> | null;
}

/** Result of `Catalog.testConnection()` — the PHP `testConnection()` shape. */
export interface ConnectionTestResult {
  success: boolean;
  message: string;
  productCount?: number;
}
