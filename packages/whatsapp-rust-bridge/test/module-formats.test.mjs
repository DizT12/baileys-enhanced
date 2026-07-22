import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import * as bridge from "whatsapp-rust-bridge";

const require = createRequire(import.meta.url);

test("ESM entry point exposes a working bridge", () => {
  const digest = bridge.md5(new TextEncoder().encode("abc"));
  assert.equal(
    Buffer.from(digest).toString("hex"),
    "900150983cd24fb0d6963f7d28e17f72",
  );

  const encoded = bridge.encodeNode({
    tag: "iq",
    attrs: { id: "esm-smoke" },
  });
  assert.equal(bridge.decodeNode(encoded).attrs.id, "esm-smoke");
});

test("ESM and CommonJS entry points expose the same API", () => {
  const commonJsBridge = require("whatsapp-rust-bridge");
  assert.deepEqual(
    Object.keys(bridge).sort(),
    Object.keys(commonJsBridge).sort(),
  );
});
