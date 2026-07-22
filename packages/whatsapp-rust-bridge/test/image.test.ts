import { describe, it, expect } from "@jest/globals";
import { getEnabledFeatures } from "../dist/index.js";
import fs from "node:fs";

const features = getEnabledFeatures();
const describeImage = features.image ? describe : describe.skip;

// 1x1 red PNG pixel (base64)
const SAMPLE_IMAGE =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAABAAAAAQBPJcTWAAAADElEQVR4nGP8x8AAAAMCAQBFsWYPAAAAAElFTkSuQmCC";
// 8193x1 PNG: small encoded payload with a declared dimension above the decoder limit.
const OVERSIZED_IMAGE =
  "iVBORw0KGgoAAAANSUhEUgAAIAEAAAABCAIAAAAW69wJAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAL0lEQVR4nO3BMQEAAADCoPVPbQlPoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgA4GYAQAATBvg1EAAAAASUVORK5CYII=";

// Only load image assets if the feature is enabled
const PNG_BUFFER = features.image
  ? fs.readFileSync(new URL("../assets/image.png", import.meta.url))
  : new Uint8Array();
const WEBP_BUFFER = features.image
  ? fs.readFileSync(new URL("../assets/static.webp", import.meta.url))
  : new Uint8Array();

interface ImageDimensions {
  width: number;
  height: number;
}

interface ImageFunctions {
  extractImageThumb(
    input: Uint8Array,
    width: number
  ): { buffer: Uint8Array; original: ImageDimensions };
  generateProfilePicture(input: Uint8Array, width: number): { img: Uint8Array };
  getImageDimensions(input: Uint8Array): ImageDimensions;
  convertToWebP(input: Uint8Array): Uint8Array;
  processImage(
    input: Uint8Array,
    options: {
      width?: number;
      height?: number;
      format: "jpeg" | "png" | "webp";
      quality?: number;
    }
  ): { buffer: Uint8Array; width: number; height: number };
}

const {
  extractImageThumb,
  generateProfilePicture,
  getImageDimensions,
  convertToWebP,
  processImage,
} = (features.image
  ? await import("../dist/index.js")
  : {}) as unknown as ImageFunctions;

// Magic bytes for format detection
const MAGIC = {
  jpeg: [0xff, 0xd8, 0xff],
  png: [0x89, 0x50, 0x4e, 0x47],
  webp: [0x52, 0x49, 0x46, 0x46], // RIFF, also check bytes 8-11 for WEBP
} as const;

function hasPrefix(buffer: Uint8Array, prefix: readonly number[]): boolean {
  return prefix.every((byte, i) => buffer[i] === byte);
}

function isValidFormat(
  buffer: Uint8Array,
  format: "jpeg" | "png" | "webp"
): boolean {
  if (format === "webp") {
    // Check RIFF header and WEBP signature at offset 8
    return (
      buffer.length >= 12 &&
      hasPrefix(buffer, MAGIC.webp) &&
      buffer[8] === 0x57 &&
      buffer[9] === 0x45 &&
      buffer[10] === 0x42 &&
      buffer[11] === 0x50
    );
  }
  return hasPrefix(buffer, MAGIC[format]);
}

describeImage("Image Utils", () => {
  const imageBuffer = Buffer.from(SAMPLE_IMAGE, "base64");

  it("extracts an image thumbnail", () => {
    const result = extractImageThumb(imageBuffer, 32);

    expect(result).toBeDefined();
    expect(result.original).toBeDefined();
    expect(result.original.width).toBe(1);
    expect(result.original.height).toBe(1);

    expect(result.buffer).toBeInstanceOf(Uint8Array);
    expect(result.buffer.length).toBeGreaterThan(0);
  });

  it("generates a square profile picture", () => {
    const targetWidth = 64;
    const result = generateProfilePicture(imageBuffer, targetWidth);

    expect(result).toBeDefined();
    expect(result.img).toBeInstanceOf(Uint8Array);
    expect(result.img.length).toBeGreaterThan(0);
  });

  it("throws on invalid image data", () => {
    const invalidBuffer = new Uint8Array([0, 1, 2, 3]);
    expect(() => extractImageThumb(invalidBuffer, 32)).toThrow();
  });

  it("rejects oversized target dimensions", () => {
    expect(() => extractImageThumb(imageBuffer, 8_193)).toThrow("8192");
    expect(() => generateProfilePicture(imageBuffer, 8_193)).toThrow("8192");
  });
});

describeImage("getImageDimensions", () => {
  it("returns correct dimensions for PNG", () => {
    const dims = getImageDimensions(PNG_BUFFER);
    expect(dims.width).toBe(1000);
    expect(dims.height).toBe(1000);
  });

  it("returns correct dimensions for WebP", () => {
    const dims = getImageDimensions(WEBP_BUFFER);
    expect(dims.width).toBeGreaterThan(0);
    expect(dims.height).toBeGreaterThan(0);
  });

  it("throws on invalid data", () => {
    expect(() => getImageDimensions(new Uint8Array([1, 2, 3]))).toThrow();
  });

  it("rejects images with oversized declared dimensions", () => {
    const oversized = Buffer.from(OVERSIZED_IMAGE, "base64");
    expect(() => getImageDimensions(oversized)).toThrow();
  });
});

describeImage("convertToWebP", () => {
  it("converts PNG to valid WebP", () => {
    const result = convertToWebP(PNG_BUFFER);
    expect(isValidFormat(result, "webp")).toBe(true);
  });

  it("converts WebP to WebP (passthrough)", () => {
    const result = convertToWebP(WEBP_BUFFER);
    expect(isValidFormat(result, "webp")).toBe(true);
  });
});

describeImage("processImage", () => {
  it("resizes to exact dimensions", () => {
    const result = processImage(PNG_BUFFER, {
      width: 100,
      height: 100,
      format: "jpeg",
    });
    expect(result.width).toBe(100);
    expect(result.height).toBe(100);
    expect(isValidFormat(result.buffer, "jpeg")).toBe(true);
  });

  it("preserves aspect ratio with width only", () => {
    const result = processImage(PNG_BUFFER, {
      width: 500,
      height: undefined,
      format: "png",
    });
    expect(result.width).toBe(500);
    expect(result.height).toBe(500); // 1000x1000 -> 500x500
    expect(isValidFormat(result.buffer, "png")).toBe(true);
  });

  it("converts between formats", () => {
    const formats = ["jpeg", "png", "webp"] as const;
    for (const format of formats) {
      const result = processImage(PNG_BUFFER, {
        width: 50,
        height: 50,
        format,
      });
      expect(isValidFormat(result.buffer, format)).toBe(true);
    }
  });

  it("rejects oversized resize dimensions", () => {
    expect(() =>
      processImage(PNG_BUFFER, {
        width: 8_193,
        height: 100,
        format: "jpeg",
      })
    ).toThrow("8192");
  });
});
