import { describe, it, expect } from '@jest/globals'
import { SessionRecord } from '../dist/index.js'

const syntheticFixtureValue = (name: string) => `synthetic-${name}-fixture`

describe('SessionRecord Compatibility & Migration', () => {
	it('should handle legacy libsignal-node JSON format by returning a safe empty session', () => {
		const sessionKey = syntheticFixtureValue('session-key')
		// Preserve the legacy export shape without embedding cryptographic material.
		const legacyJson = {
			_sessions: {
				[sessionKey]: {
					registrationId: 12345,
					currentRatchet: {
						ephemeralKeyPair: {
							pubKey: syntheticFixtureValue('ephemeral-public-key'),
							privKey: syntheticFixtureValue('ephemeral-private-key')
						},
						lastRemoteEphemeralKey: syntheticFixtureValue('remote-ephemeral-key'),
						previousCounter: 0,
						rootKey: syntheticFixtureValue('root-key')
					},
					indexInfo: {
						baseKey: sessionKey,
						baseKeyType: 2,
						closed: -1,
						used: 2,
						created: 1,
						remoteIdentityKey: syntheticFixtureValue('remote-identity-key')
					},
					_chains: {}
				}
			},
			version: 'v1'
		}

		// Attempt to deserialize the legacy object
		// This should NOT throw, but instead return a reset SessionRecord
		const record = SessionRecord.deserialize(legacyJson)

		expect(record).toBeInstanceOf(SessionRecord)

		// Important: Because we cannot easily migrate cryptographic state from JSON to Protobuf
		// without raw access to the crypto primitives in Rust, we expect the bridge
		// to return an EMPTY session. This forces the client to negotiate a new session
		// automatically (self-healing) rather than crashing.
		expect(record.haveOpenSession()).toBe(false)

		// Ensure the result is a valid serializeable object (now a standard protobuf binary)
		const serialized = record.serialize()
		expect(serialized).toBeInstanceOf(Uint8Array)
		// expect(serialized.length).toBeGreaterThan(0);
	})

	it('should handle Buffer-like objects (common in JSON database dumps)', () => {
		// Simulate a JSON object that represents a Buffer (e.g. from lowdb/Baileys auth store)
		// This is just random bytes, not a valid proto, but the deserialize -> new wrapping
		// doesn't validate proto structure until usage.
		const bufferObj = {
			type: 'Buffer',
			data: [1, 2, 3, 4, 5, 255]
		}

		const record = SessionRecord.deserialize(bufferObj)

		expect(record).toBeInstanceOf(SessionRecord)

		const output = record.serialize()
		expect(output).toBeInstanceOf(Uint8Array)
		expect(output).toEqual(new Uint8Array([1, 2, 3, 4, 5, 255]))
	})

	it('should handle standard Uint8Array input', () => {
		const input = new Uint8Array([10, 20, 30, 40])
		const record = SessionRecord.deserialize(input)

		expect(record).toBeInstanceOf(SessionRecord)
		expect(record.serialize()).toEqual(input)
	})

	it('should handle plain JS Arrays', () => {
		const input = [10, 20, 30, 40]
		const record = SessionRecord.deserialize(input)

		expect(record).toBeInstanceOf(SessionRecord)
		expect(record.serialize()).toEqual(new Uint8Array(input))
	})

	it('should throw on invalid input', () => {
		expect(() => SessionRecord.deserialize('invalid string')).toThrow()
		expect(() => SessionRecord.deserialize(12345)).toThrow()
		expect(() => SessionRecord.deserialize(null)).toThrow()
	})

	it('should reject arrays containing invalid byte values', () => {
		for (const input of [[1, '2', 3], [-1], [1.5], [256], [Number.NaN]]) {
			expect(() => SessionRecord.deserialize(input)).toThrow('Invalid byte')
		}

		expect(() => SessionRecord.deserialize({ type: 'Buffer', data: [1, null, 3] })).toThrow('Invalid byte')
	})

	it('rejects sparse arrays with forged large lengths without preallocating', () => {
		const input: number[] = []
		input.length = 0xffffffff

		expect(() => SessionRecord.deserialize(input)).toThrow('Invalid byte at index 0')
	})
})
