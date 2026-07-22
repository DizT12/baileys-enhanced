# whatsapp-rust-bridge

High-performance WhatsApp utilities powered by Rust and WebAssembly. Consumed by [`baileys`](../baileys).

This package is developed inside the [Baileys monorepo](https://github.com/WhiskeySockets/Baileys) under `packages/whatsapp-rust-bridge/` and published independently to npm.

## Features

| Feature                        | Status |
| ------------------------------ | ------ |
| Binary Protocol                | ✅     |
| Libsignal                      | ✅     |
| App State Sync                 | ✅     |
| Audio (waveform, duration)     | ✅     |
| Image (thumbnails, conversion) | ✅     |
| Sticker Metadata               | ✅     |

## Install

```bash
npm install whatsapp-rust-bridge
# or
pnpm add whatsapp-rust-bridge
```

The published package ships Node.js ESM (`dist/index.js`) and CommonJS (`dist/index.cjs`) entry points plus separate SIMD and non-SIMD modules under `dist/wasm/`. Runtime probes SIMD support and reads only the selected module. Keep the complete installed package when deploying; copying an entry-point file without its adjacent `wasm/` directory is not supported. There are no native dependencies.

To force the non-SIMD variant:

```bash
WHATSAPP_RUST_BRIDGE_FORCE_NOSIMD=1 node ./your-app.js
```

## Baileys integration

- [#1698](https://github.com/WhiskeySockets/Baileys/pull/1698) — Binary Protocol
- [#2067](https://github.com/WhiskeySockets/Baileys/pull/2067) — Libsignal

## Contributing

See the package-level [`AGENTS.md`](./AGENTS.md) for Rust crate conventions and the monorepo-wide [`AGENTS.md`](../../AGENTS.md) for setup, lint/test/release flow, and how the prebuilt-tarball postinstall works.
