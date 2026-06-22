import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/features.ts"],
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  // `stripe` is an (optional-but-expected) peer dependency and
  // `@particle-academy/fancy-features` is only a type-level structural mirror —
  // never bundle either. Keep the build platform-neutral so it stays isomorphic.
  platform: "neutral",
  external: ["stripe", "@particle-academy/fancy-features"],
  treeshake: true,
});
