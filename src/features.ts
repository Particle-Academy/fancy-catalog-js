/**
 * @particle-academy/fancy-catalog/features
 *
 * The integration bridge: exposes a Catalog as a `FeatureSource` for
 * `@particle-academy/fancy-features`.
 *
 * `@particle-academy/fancy-features` is an OPTIONAL peer dependency
 * (peerDependenciesMeta.optional = true) and is NEVER imported at runtime —
 * the contract types below are a VERBATIM structural mirror, so a
 * catalog-built `FeatureSource` is assignable to the features-built one with
 * no build-time dependency. Keep these byte-identical with the canonical
 * source.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CANONICAL SOURCE: `@particle-academy/fancy-features` (see its barrel `.`).
 * That package OWNS these types; this file mirrors `FeatureType`,
 * `FeatureGrant`, and `FeatureSource` verbatim. Do not diverge.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { Catalog } from "./catalog.js";

// ---- Mirrored shared feature contract (canonical: @particle-academy/fancy-features) ----

export type FeatureType = "boolean" | "resource";

/** Opaque caller-defined subject (user/org/subscription handle). */
export type Subject = unknown;

/**
 * A resolved entitlement for ONE feature, for ONE subject — what a
 * FeatureSource returns. (The Node analog of a `product_feature_configs`
 * pivot row resolved for a subscription.)
 */
export interface FeatureGrant {
  key: string; // feature key (== Feature.key == ProductFeature.key)
  type: FeatureType; // "boolean" | "resource"
  enabled: boolean; // included / on for this subject?
  includedQuantity?: number | null; // resource: quota per period (null = unlimited)
  overageLimit?: number | null; // resource: soft cap before block
  source?: string; // provenance for explain(), e.g. "catalog:prod_123"
  config?: Record<string, unknown>;
}

/**
 * THE INTEGRATION EXTENSION POINT. A pluggable source of per-subject grants.
 * fancy-catalog implements this (subscription → product → product-features).
 * fancy-features consumes any number of these as the last link in its
 * resolution chain.
 */
export interface FeatureSource {
  readonly name: string; // for explain()/debug, e.g. "catalog"
  grantsFor(subject: Subject, context?: unknown): FeatureGrant[] | Promise<FeatureGrant[]>;
}

// ---- Catalog-specific bridge ----

/**
 * The minimal subscription shape the bridge needs. The app resolves a subject
 * to one of these (catalog is storage-agnostic about subjects).
 */
export interface Subscription {
  id: string;
  productId: string;
  status?: string;
  renewsAt?: Date | null;
}

export interface CatalogFeatureSourceOptions {
  /** subject → their active subscription (app-supplied). */
  resolveSubscription: (
    subject: Subject,
    context?: unknown,
  ) => Subscription | null | Promise<Subscription | null>;
}

/**
 * Build a `FeatureSource` that resolves a subject's grants from their active
 * subscription's product features. Replaces the PHP "Database strategy / Fms
 * service" catalog bridge.
 */
export function createCatalogFeatureSource(
  catalog: Catalog,
  opts: CatalogFeatureSourceOptions,
): FeatureSource {
  return {
    name: "catalog",
    async grantsFor(subject, context) {
      const sub = await opts.resolveSubscription(subject, context);
      if (!sub) return [];
      const product = await catalog.products.find(sub.productId);
      if (!product) return [];
      const pfcs = await catalog.productFeatures.forProduct(product.id);
      return pfcs.map((p) => ({
        key: p.feature.key,
        type: p.feature.type,
        enabled: p.enabled,
        includedQuantity: p.includedQuantity ?? null,
        overageLimit: p.overageLimit ?? null,
        source: `catalog:${product.id}`,
        config: p.config ?? undefined,
      }));
    },
  };
}
