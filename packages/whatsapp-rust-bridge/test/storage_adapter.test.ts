import { describe, it, expect } from "@jest/globals";
import {
  GroupSessionBuilder,
  ProtocolAddress,
  SenderKeyName,
  SessionBuilder,
  SessionCipher,
  SessionRecord,
  generateIdentityKeyPair,
  generatePreKey,
  generateRegistrationId,
  generateSignedPreKey,
} from "../dist/index.js";
import { FakeStorage } from "./helpers/fake_storage";

class RejectingPersistenceStorage extends FakeStorage {
  public failSessionStore = true;
  public failSenderKeyStore = true;
  public failIdentityStore = false;
  public sessionLoadCount = 0;
  public senderKeyLoadCount = 0;

  override async loadSession(address: string): Promise<Uint8Array | undefined> {
    this.sessionLoadCount += 1;
    return super.loadSession(address);
  }

  override async storeSessionRaw(
    address: string,
    data: Uint8Array
  ): Promise<void> {
    if (this.failSessionStore) {
      throw new Error("session persistence failed");
    }
    await super.storeSessionRaw(address, data);
  }

  override async loadSenderKey(keyId: string): Promise<Uint8Array | undefined> {
    this.senderKeyLoadCount += 1;
    return super.loadSenderKey(keyId);
  }

  override async storeSenderKey(
    keyId: string,
    record: Uint8Array
  ): Promise<void> {
    if (this.failSenderKeyStore) {
      throw new Error("sender-key persistence failed");
    }
    await super.storeSenderKey(keyId, record);
  }

  override async saveIdentity(
    identifier: string,
    identityKey: Uint8Array
  ): Promise<boolean> {
    if (this.failIdentityStore) {
      throw new Error("identity persistence failed");
    }
    return super.saveIdentity(identifier, identityKey);
  }
}

function makePreKeyBundle() {
  const identity = generateIdentityKeyPair();
  const signedPreKey = generateSignedPreKey(identity, 1);
  const preKey = generatePreKey(2);

  return {
    registrationId: generateRegistrationId(),
    identityKey: identity.pubKey,
    signedPreKey: {
      keyId: signedPreKey.keyId,
      publicKey: signedPreKey.keyPair.pubKey,
      signature: signedPreKey.signature,
    },
    preKey: {
      keyId: preKey.keyId,
      publicKey: preKey.keyPair.pubKey,
    },
  };
}

describe("StorageAdapter Interop", () => {
  const aliceAddress = new ProtocolAddress("alice", 1);

  it("should gracefully handle legacy JSON session objects by treating them as empty", async () => {
    const storage = new FakeStorage();

    // Mock data structure mimicked from libsignal-node
    const legacyJson = {
      _sessions: {
        "BXqk9qn8...": {
          registrationId: 123,
          currentRatchet: {},
          indexInfo: {
            baseKey: "BXqk9qn8...",
            baseKeyType: 2,
            closed: -1,
          },
          _chains: {},
        },
      },
      version: "v1",
    };

    // Override loadSession to return the legacy object directly
    // @ts-ignore
    storage.loadSession = async () => legacyJson;

    const cipher = new SessionCipher(storage, aliceAddress);

    // The previous crash was: "error while invoking an ffi callback: JsValue(Object(...))"
    // We expect the Rust adapter to now detect the object, return an empty session,
    // and then the Cipher logic simply complains that there's no open session.
    try {
      await cipher.encrypt(new Uint8Array([1, 2, 3]));
      throw new Error("Should have thrown a logic error (No open session)");
    } catch (e: any) {
      const msg = e.toString();
      // Ensure it's NOT the FFI crash
      expect(msg).not.toContain("error while invoking an ffi callback");
      expect(msg).not.toContain("JsValue(Object");

      // It usually throws a generic string error from Rust like "No open session" or "No session record"
      // The exact message depends on wacore, but ensuring it's not the crash is sufficient.
    }
  });

  it("should correctly load Buffer-like objects { type: 'Buffer', data: [...] }", async () => {
    const storage = new FakeStorage();

    // 1. Create a valid (empty) session to serialize so we have valid protobuf bytes
    // Use deserialize with empty array to get a valid empty session
    const record = SessionRecord.deserialize(new Uint8Array([]));
    const validBytes = record.serialize();

    // 2. Wrap it in the Buffer-like structure common in JSON DBs (lowdb)
    const bufferLike = {
      type: "Buffer",
      data: Array.from(validBytes),
    };

    // @ts-ignore
    storage.loadSession = async () => bufferLike;

    const cipher = new SessionCipher(storage, aliceAddress);

    try {
      await cipher.encrypt(new Uint8Array([1]));
      throw new Error("Should have thrown a logic error");
    } catch (e: any) {
      const msg = e.toString();
      expect(msg).not.toContain("error while invoking an ffi callback");
      // Should not fail with protobuf parsing error if it converted correctly
      expect(msg).not.toContain("Protobuf");
      expect(msg).not.toContain("invalid wire type");
    }
  });

  it("should reject invalid byte arrays returned by storage", async () => {
    const storage = new FakeStorage();
    storage.loadSession = async () =>
      [1, "invalid", 3] as unknown as Uint8Array;

    const cipher = new SessionCipher(storage, aliceAddress);
    await expect(cipher.hasOpenSession()).rejects.toEqual(
      expect.stringContaining("Invalid byte")
    );
  });

  it("should not cache a session when persistence rejects", async () => {
    const storage = new RejectingPersistenceStorage();
    const builder = new SessionBuilder(storage, aliceAddress);
    const bundle = makePreKeyBundle();

    await expect(builder.processPreKeyBundle(bundle)).rejects.toEqual(
      expect.stringContaining("session persistence failed")
    );
    expect(storage.sessionLoadCount).toBe(1);

    storage.failSessionStore = false;
    await builder.processPreKeyBundle(bundle);

    expect(storage.sessionLoadCount).toBe(2);
    expect(storage.getSession(aliceAddress.toString())).toBeDefined();
  });

  it("should not cache a sender key when persistence rejects", async () => {
    const storage = new RejectingPersistenceStorage();
    const builder = new GroupSessionBuilder(storage);
    const senderKeyName = new SenderKeyName("cache-test@g.us", aliceAddress);

    await expect(builder.create(senderKeyName)).rejects.toEqual(
      expect.stringContaining("sender-key persistence failed")
    );
    expect(storage.senderKeyLoadCount).toBe(1);

    storage.failSenderKeyStore = false;
    await builder.create(senderKeyName);

    expect(storage.senderKeyLoadCount).toBe(2);
    expect(storage.senderKeys.get(senderKeyName.toString())).toBeDefined();
  });

  it("should not cache a peer identity when persistence rejects", async () => {
    const storage = new RejectingPersistenceStorage();
    storage.failIdentityStore = true;
    const builder = new SessionBuilder(storage, aliceAddress);
    const bundle = makePreKeyBundle();

    await expect(builder.processPreKeyBundle(bundle)).rejects.toEqual(
      expect.stringContaining("identity persistence failed")
    );
    expect(storage.identityLoadCount).toBe(1);
    expect(storage.getIdentity("alice")).toBeUndefined();

    storage.failIdentityStore = false;
    storage.failSessionStore = false;
    await builder.processPreKeyBundle(bundle);

    expect(storage.identityLoadCount).toBe(2);
    expect(storage.getIdentity("alice")).toEqual(bundle.identityKey);
  });
});
