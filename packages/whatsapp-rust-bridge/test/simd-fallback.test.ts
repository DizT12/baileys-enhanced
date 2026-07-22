import { describe, expect, test } from "@jest/globals";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const probe = resolve(testDirectory, "helpers/probe-runtime.ts");
const simdProbe = new Uint8Array([
  0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8,
  0, 65, 0, 253, 15, 253, 98, 11,
]);

function probeEnv(extraEnv: Record<string, string> = {}) {
  const env = { ...process.env };
  delete env.WHATSAPP_RUST_BRIDGE_FORCE_NOSIMD;
  return { ...env, ...extraEnv };
}

function runProbe(extraEnv: Record<string, string> = {}) {
  const r = spawnSync(process.execPath, ["--import", "tsx", probe], {
    env: probeEnv(extraEnv),
    encoding: "utf8",
  });
  if (r.status !== 0) {
    throw new Error(
      `probe exited with ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`
    );
  }
  const lines = r.stdout.trim().split("\n");
  return JSON.parse(lines[lines.length - 1]);
}

describe("SIMD / non-SIMD initialization paths", () => {
  test("default path uses the best supported wasm and exposes working bridge", () => {
    const out = runProbe();
    expect(out.simdActive).toBe(WebAssembly.validate(simdProbe));
    expect(out.encodedLen).toBeGreaterThan(0);
    expect(out.decodedTag).toBe("iq");
    expect(out.decodedAttrsOk).toBe(true);
    expect(out.md5Hex).toBe("900150983cd24fb0d6963f7d28e17f72");
    expect(out.hkdfLen).toBe(32);
  });

  test("forced non-SIMD path falls back to nosimd wasm with identical output", () => {
    const out = runProbe({ WHATSAPP_RUST_BRIDGE_FORCE_NOSIMD: "1" });
    expect(out.simdActive).toBe(false);
    expect(out.encodedLen).toBeGreaterThan(0);
    expect(out.decodedTag).toBe("iq");
    expect(out.decodedAttrsOk).toBe(true);
    expect(out.md5Hex).toBe("900150983cd24fb0d6963f7d28e17f72");
    expect(out.hkdfLen).toBe(32);
  });

  test("SIMD and non-SIMD paths produce byte-identical encode output", () => {
    const probeBytes = resolve(testDirectory, "helpers/probe-encode-bytes.ts");
    const simd = spawnSync(process.execPath, ["--import", "tsx", probeBytes], {
      env: probeEnv(),
      encoding: "utf8",
    });
    const noSimd = spawnSync(
      process.execPath,
      ["--import", "tsx", probeBytes],
      {
        env: probeEnv({ WHATSAPP_RUST_BRIDGE_FORCE_NOSIMD: "1" }),
        encoding: "utf8",
      }
    );
    expect(simd.status).toBe(0);
    expect(noSimd.status).toBe(0);

    const simdLines = simd.stdout.trim().split("\n");
    const noSimdLines = noSimd.stdout.trim().split("\n");
    const simdOut = JSON.parse(simdLines[simdLines.length - 1]);
    const noSimdOut = JSON.parse(noSimdLines[noSimdLines.length - 1]);
    expect(simdOut.simd).toBe(true);
    expect(noSimdOut.simd).toBe(false);
    // Byte-identical wire output and structurally identical decoded form.
    expect(simdOut.encHex).toBe(noSimdOut.encHex);
    expect(simdOut.decoded).toEqual(noSimdOut.decoded);
  });
});
