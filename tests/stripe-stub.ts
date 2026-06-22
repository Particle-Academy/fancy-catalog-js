import { vi } from "vitest";
import type Stripe from "stripe";

/**
 * A minimal recording stub of the `Stripe` instance — just the methods the
 * catalog touches. Cast to `Stripe` at the call site; we never construct the
 * real SDK in tests.
 */
export interface StripeStub {
  products: {
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    list: ReturnType<typeof vi.fn>;
  };
  prices: {
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    retrieve: ReturnType<typeof vi.fn>;
  };
  checkout: {
    sessions: {
      create: ReturnType<typeof vi.fn>;
    };
  };
}

let seq = 0;

export function makeStripeStub(overrides: Partial<{
  retrievePrice: Record<string, unknown>;
}> = {}): { stub: StripeStub; stripe: Stripe } {
  const stub: StripeStub = {
    products: {
      create: vi.fn(async (data: Record<string, unknown>) => ({
        id: `prod_${++seq}`,
        ...data,
      })),
      update: vi.fn(async (id: string, data: Record<string, unknown>) => ({
        id,
        ...data,
      })),
      list: vi.fn(async () => ({ data: [{ id: "prod_a" }, { id: "prod_b" }] })),
    },
    prices: {
      create: vi.fn(async (data: Record<string, unknown>) => ({
        id: `price_${++seq}`,
        ...data,
      })),
      update: vi.fn(async (id: string, data: Record<string, unknown>) => ({
        id,
        ...data,
      })),
      retrieve: vi.fn(async (_id: string) =>
        overrides.retrievePrice ?? {
          id: _id,
          unit_amount: 2900,
          currency: "usd",
          billing_scheme: "per_unit",
          recurring: { interval: "month", interval_count: 1, usage_type: "licensed" },
        },
      ),
    },
    checkout: {
      sessions: {
        create: vi.fn(async (data: Record<string, unknown>) => ({
          id: `cs_${++seq}`,
          url: "https://checkout.stripe.test/session",
          ...data,
        })),
      },
    },
  };

  return { stub, stripe: stub as unknown as Stripe };
}
