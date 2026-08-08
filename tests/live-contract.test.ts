import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { validateLiveContract } from "@particle-academy/fancy-query";
import { catalogLive } from "../src/live";

describe("catalog Live Contract", () => {
    it("is well-formed", () => {
        expect(validateLiveContract(catalogLive)).toEqual([]);
    });

    it("declares every event under its own namespace", () => {
        for (const { event } of catalogLive.events) {
            expect(event.startsWith("catalog."), `${event} is not in the catalog namespace`).toBe(true);
        }
    });

    it("names a channel, so a host does not have to guess one", () => {
        expect(catalogLive.channel).toBeTruthy();
    });
});

/**
 * The parity half.
 *
 * This is the test the whole contract exists for. A mirror pair drifts when
 * only one side is edited, and here drift is SILENT: rename an event on the PHP
 * side and nothing throws — the browser subscribes to a name nobody broadcasts,
 * the cache is never invalidated, and the UI simply stops updating.
 *
 * Read out of the PHP source rather than through a running Laravel app, so the
 * assertion holds in a plain `npm test` with no PHP toolchain present.
 */
describe("parity with LaravelCatalog\\LiveContract", () => {
    const phpPath = join(__dirname, "..", "..", "laravel-catalog", "src", "LiveContract.php");

    function phpContract(): { namespace: string; channel: string; events: Record<string, string[][]> } | null {
        let source: string;
        try {
            source = readFileSync(phpPath, "utf8");
        } catch {
            return null;
        }

        const ns = /const NAMESPACE = '([^']+)'/.exec(source)?.[1] ?? "";
        const channel = /const CHANNEL = '([^']+)'/.exec(source)?.[1] ?? "";

        const events: Record<string, string[][]> = {};
        const block = /const EVENTS = \[([\s\S]*?)\n    \];/.exec(source)?.[1] ?? "";

        // Line by line rather than one multiline regex. The first attempt
        // required a trailing newline after each entry and so silently dropped
        // the LAST one — 5 of 6 parsed, and the "did it parse anything" guard
        // still passed because it only checked for non-empty.
        for (const line of block.split("\n")) {
            const m = /^\s*'([a-z0-9.\-_]+)'\s*=>\s*(\[.*\])\s*,?\s*$/.exec(line);
            if (!m) continue;

            const keys: string[][] = [];
            for (const [, inner] of m[2]!.matchAll(/\[([^[\]]*)\]/g)) {
                keys.push([...inner.matchAll(/'([^']+)'/g)].map((k) => k[1]!));
            }
            events[m[1]!] = keys;
        }

        return { namespace: ns, channel, events };
    }

    it("agrees on the namespace and channel", () => {
        const php = phpContract();
        // The sibling repo is present in the envelope but not in a standalone
        // clone. Skipping beats a false failure that says the contracts differ.
        if (php === null) return;

        expect(php.namespace).toBe(catalogLive.namespace);
        expect(php.channel).toBe(catalogLive.channel);
    });

    it("declares the SAME event names on both sides", () => {
        const php = phpContract();
        if (php === null) return;

        expect(Object.keys(php.events).sort()).toEqual(catalogLive.events.map((e) => e.event).sort());
    });

    it("invalidates the SAME keys for every event", () => {
        const php = phpContract();
        if (php === null) return;

        for (const { event, keys } of catalogLive.events) {
            expect(php.events[event], `PHP does not declare ${event}`).toBeDefined();
            expect(php.events[event], `keys differ for ${event}`).toEqual(keys.map((k) => [...k]));
        }
    });

    it("parsed the PHP COMPLETELY, not just partially", () => {
        // A parser that silently matches nothing makes every assertion above
        // vacuously true — the parity test would pass hardest exactly when it
        // had stopped testing anything.
        //
        // Asserting a COUNT rather than "more than zero", because the first
        // version of this parser dropped the last entry and a non-empty check
        // sailed straight past it.
        const php = phpContract();
        if (php === null) return;

        expect(php.namespace).not.toBe("");
        expect(Object.keys(php.events)).toHaveLength(catalogLive.events.length);
        for (const keys of Object.values(php.events)) {
            expect(keys.length, "an event parsed with no keys — the key regex missed").toBeGreaterThan(0);
        }
    });
});
