import { describe, it, expect } from "@jest/globals";
import { getEnabledFeatures } from "../dist/index.js";
import fs from "node:fs";

const features = getEnabledFeatures();
const describeAudio = features.audio ? describe : describe.skip;

// Only load audio assets and functions if the feature is enabled
const audioBuffer = features.audio
  ? fs.readFileSync(new URL("../assets/sonata.mp3", import.meta.url))
  : new Uint8Array();

interface AudioFunctions {
  generateAudioWaveform(input: Uint8Array): Uint8Array;
  getAudioDuration(
    input: Uint8Array | ReadableStream<Uint8Array>
  ): Promise<number>;
}

// Optional exports are absent from default-build declarations and runtime.
const { generateAudioWaveform, getAudioDuration } = (features.audio
  ? await import("../dist/index.js")
  : {}) as unknown as AudioFunctions;

const EXPECTED_DURATION_SECONDS = 42.736326530612246;

describeAudio("Audio Waveform Generation", () => {
  it("creates a 64-sample waveform from MP3 audio", () => {
    const waveform = generateAudioWaveform(audioBuffer);

    expect(waveform).toBeInstanceOf(Uint8Array);
    expect(waveform.length).toBe(64);
    expect(Math.max(...waveform)).toBeLessThanOrEqual(100);
  });

  it("throws on invalid audio data", () => {
    const randomBytes = new Uint8Array(256).fill(0x55);
    expect(() => generateAudioWaveform(randomBytes)).toThrow();
  });

  it("throws on empty input", () => {
    expect(() => generateAudioWaveform(new Uint8Array())).toThrow();
  });
});

describeAudio("Audio Duration", () => {
  it("returns duration for Uint8Array input", async () => {
    const duration = await getAudioDuration(audioBuffer);

    expect(duration).toBeGreaterThan(0);
    expect(duration).toBeGreaterThan(40);
    expect(duration).toBeLessThan(45);
    expect(duration).toBeCloseTo(EXPECTED_DURATION_SECONDS, 3);
  });

  it("supports ReadableStream input", async () => {
    const chunkSize = 64 * 1024;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let offset = 0; offset < audioBuffer.length; offset += chunkSize) {
          controller.enqueue(audioBuffer.subarray(offset, offset + chunkSize));
        }
        controller.close();
      },
    });

    const duration = await getAudioDuration(stream);
    expect(duration).toBeGreaterThan(40);
    expect(duration).toBeLessThan(45);
    expect(duration).toBeCloseTo(EXPECTED_DURATION_SECONDS, 3);
  });

  it("throws on invalid audio data", async () => {
    const randomBytes = new Uint8Array(256).fill(0x55);
    await expect(getAudioDuration(randomBytes)).rejects.toEqual(
      expect.stringContaining("no suitable format reader found")
    );
  });

  it("throws on empty input", async () => {
    await expect(getAudioDuration(new Uint8Array())).rejects.toBe(
      "Audio buffer is empty"
    );
  });
});
