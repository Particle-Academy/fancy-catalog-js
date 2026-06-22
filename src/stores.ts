/**
 * Persistence adapters. The PHP package is Eloquent-coupled; the Node port
 * hides storage behind small interfaces with in-memory defaults. Every method
 * returns `T | Promise<T>` so a consumer may back them with a sync in-memory
 * map or an async DB; catalog internals `await` uniformly.
 *
 * Soft-delete semantics mirror the PHP `SoftDeletes` trait: `all()` /
 * `find()` exclude rows whose `deletedAt` is set unless `withTrashed` is
 * passed; `remove()` is a soft delete (sets `deletedAt`).
 */

import type {
  Price,
  Product,
  ProductFeature,
  ProductFeatureConfig,
  ProductFeatureWithConfig,
} from "./types.js";

export interface ProductStore {
  find(id: string, opts?: { withTrashed?: boolean }): Product | null | Promise<Product | null>;
  all(opts?: { withTrashed?: boolean }): Product[] | Promise<Product[]>;
  save(product: Product): Product | Promise<Product>;
  remove(id: string): void | Promise<void>;
}

export interface PriceStore {
  find(id: string, opts?: { withTrashed?: boolean }): Price | null | Promise<Price | null>;
  /** Prices for a product (the PHP `Product::prices()` relation). */
  forProduct(productId: string, opts?: { withTrashed?: boolean }): Price[] | Promise<Price[]>;
  all(opts?: { withTrashed?: boolean }): Price[] | Promise<Price[]>;
  save(price: Price): Price | Promise<Price>;
  remove(id: string): void | Promise<void>;
}

export interface ProductFeatureStore {
  find(id: string): ProductFeature | null | Promise<ProductFeature | null>;
  findByKey(key: string): ProductFeature | null | Promise<ProductFeature | null>;
  all(): ProductFeature[] | Promise<ProductFeature[]>;
  save(feature: ProductFeature): ProductFeature | Promise<ProductFeature>;
  remove(id: string): void | Promise<void>;

  /**
   * The `product_feature_configs` pivot rows for a product, joined to their
   * ProductFeature — the PHP `Product::productFeatures()` belongsToMany with
   * pivot. This is what `createCatalogFeatureSource` consumes.
   */
  forProduct(productId: string): ProductFeatureWithConfig[] | Promise<ProductFeatureWithConfig[]>;

  /** Attach / update a pivot row (the PHP `attach`/`sync` with pivot data). */
  setConfig(config: ProductFeatureConfig): ProductFeatureConfig | Promise<ProductFeatureConfig>;
  /** Raw pivot rows for a product. */
  configsForProduct(productId: string): ProductFeatureConfig[] | Promise<ProductFeatureConfig[]>;
}

// ---------------------------------------------------------------------------
// In-memory defaults
// ---------------------------------------------------------------------------

function isTrashed(row: { deletedAt?: Date | null }): boolean {
  return row.deletedAt != null;
}

export class InMemoryProductStore implements ProductStore {
  private rows = new Map<string, Product>();

  constructor(seed: Product[] = []) {
    for (const p of seed) this.rows.set(p.id, p);
  }

  find(id: string, opts?: { withTrashed?: boolean }): Product | null {
    const row = this.rows.get(id) ?? null;
    if (!row) return null;
    if (!opts?.withTrashed && isTrashed(row)) return null;
    return row;
  }

  all(opts?: { withTrashed?: boolean }): Product[] {
    const rows = [...this.rows.values()];
    return opts?.withTrashed ? rows : rows.filter((r) => !isTrashed(r));
  }

  save(product: Product): Product {
    this.rows.set(product.id, product);
    return product;
  }

  remove(id: string): void {
    const row = this.rows.get(id);
    if (row) row.deletedAt = new Date();
  }
}

export class InMemoryPriceStore implements PriceStore {
  private rows = new Map<string, Price>();

  constructor(seed: Price[] = []) {
    for (const p of seed) this.rows.set(p.id, p);
  }

  find(id: string, opts?: { withTrashed?: boolean }): Price | null {
    const row = this.rows.get(id) ?? null;
    if (!row) return null;
    if (!opts?.withTrashed && isTrashed(row)) return null;
    return row;
  }

  forProduct(productId: string, opts?: { withTrashed?: boolean }): Price[] {
    return [...this.rows.values()].filter(
      (r) => r.productId === productId && (opts?.withTrashed || !isTrashed(r)),
    );
  }

  all(opts?: { withTrashed?: boolean }): Price[] {
    const rows = [...this.rows.values()];
    return opts?.withTrashed ? rows : rows.filter((r) => !isTrashed(r));
  }

  save(price: Price): Price {
    this.rows.set(price.id, price);
    return price;
  }

  remove(id: string): void {
    const row = this.rows.get(id);
    if (row) row.deletedAt = new Date();
  }
}

export class InMemoryProductFeatureStore implements ProductFeatureStore {
  private features = new Map<string, ProductFeature>();
  private configs = new Map<string, ProductFeatureConfig>();

  constructor(seed: { features?: ProductFeature[]; configs?: ProductFeatureConfig[] } = {}) {
    for (const f of seed.features ?? []) this.features.set(f.id, f);
    for (const c of seed.configs ?? []) this.configs.set(c.id, c);
  }

  find(id: string): ProductFeature | null {
    return this.features.get(id) ?? null;
  }

  findByKey(key: string): ProductFeature | null {
    for (const f of this.features.values()) if (f.key === key) return f;
    return null;
  }

  all(): ProductFeature[] {
    return [...this.features.values()];
  }

  save(feature: ProductFeature): ProductFeature {
    this.features.set(feature.id, feature);
    return feature;
  }

  remove(id: string): void {
    this.features.delete(id);
    for (const [cid, c] of this.configs) {
      if (c.productFeatureId === id) this.configs.delete(cid);
    }
  }

  forProduct(productId: string): ProductFeatureWithConfig[] {
    const out: ProductFeatureWithConfig[] = [];
    for (const c of this.configs.values()) {
      if (c.productId !== productId) continue;
      const feature = this.features.get(c.productFeatureId);
      if (!feature) continue;
      out.push({
        feature,
        enabled: c.enabled,
        includedQuantity: c.includedQuantity ?? null,
        overageLimit: c.overageLimit ?? null,
        config: c.config ?? undefined,
      });
    }
    return out;
  }

  setConfig(config: ProductFeatureConfig): ProductFeatureConfig {
    this.configs.set(config.id, config);
    return config;
  }

  configsForProduct(productId: string): ProductFeatureConfig[] {
    return [...this.configs.values()].filter((c) => c.productId === productId);
  }
}
