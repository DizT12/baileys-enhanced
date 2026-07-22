#!/usr/bin/env node
import { build } from "esbuild";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const sharedOptions = {
  bundle: true,
  legalComments: "none",
  platform: "node",
  target: "node20",
};

await Promise.all([
  build({
    ...sharedOptions,
    entryPoints: [resolve(root, "ts/index.ts")],
    outfile: resolve(root, "dist/index.js"),
    format: "esm",
  }),
  build({
    ...sharedOptions,
    entryPoints: [resolve(root, "ts/index.cjs.ts")],
    outfile: resolve(root, "dist/index.cjs"),
    format: "cjs",
    // wasm-bindgen's unused async initializer references import.meta.url; the
    // synchronous initializer used by this package is retained in the bundle.
    logOverride: { "empty-import-meta": "silent" },
  }),
]);
