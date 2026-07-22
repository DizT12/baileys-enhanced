const assert = require("node:assert/strict");
const test = require("node:test");
const bridge = require("whatsapp-rust-bridge");

test("CommonJS entry point exposes a working bridge", () => {
  const digest = bridge.md5(new TextEncoder().encode("abc"));
  assert.equal(
    Buffer.from(digest).toString("hex"),
    "900150983cd24fb0d6963f7d28e17f72",
  );

  const encoded = bridge.encodeNode({
    tag: "iq",
    attrs: { id: "cjs-smoke" },
  });
  assert.equal(bridge.decodeNode(encoded).attrs.id, "cjs-smoke");
});
