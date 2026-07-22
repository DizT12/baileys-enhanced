import { describe, it, expect } from "@jest/globals";

import {
  generateIdentityKeyPair,
  generatePreKey,
  generateRegistrationId,
  generateSignedPreKey,
  ProtocolAddress,
  SessionBuilder,
} from "../dist/index.js";
import { FakeStorage } from "./helpers/fake_storage";

class AlwaysTrustStorage extends FakeStorage {
  override async isTrustedIdentity(): Promise<boolean> {
    return true;
  }
}

function makeBundle(identityKeyPair = generateIdentityKeyPair()) {
  const signedPreKey = generateSignedPreKey(identityKeyPair, 1);
  const preKey = generatePreKey(22);

  return {
    identityKeyPair,
    bundle: {
      registrationId: generateRegistrationId(),
      identityKey: identityKeyPair.pubKey,
      signedPreKey: {
        keyId: signedPreKey.keyId,
        publicKey: signedPreKey.keyPair.pubKey,
        signature: signedPreKey.signature,
      },
      preKey: {
        keyId: preKey.keyId,
        publicKey: preKey.keyPair.pubKey,
      },
    },
  };
}

describe("SessionBuilder", () => {
  it("should successfully process a pre-key bundle and create a new session", async () => {
    const aliceStorage = new FakeStorage();
    const bobAddress = new ProtocolAddress("bob", 1);
    const aliceSessionBuilder = new SessionBuilder(aliceStorage, bobAddress);

    const bobIdentityKeyPair = generateIdentityKeyPair();
    const bobRegistrationId = generateRegistrationId();
    const bobSignedPreKeyId = 1337;
    const bobSignedPreKey = generateSignedPreKey(
      bobIdentityKeyPair,
      bobSignedPreKeyId
    );
    const bobPreKeyId = 22;
    const bobPreKey = generatePreKey(bobPreKeyId);

    const bobBundle = {
      registrationId: bobRegistrationId,
      identityKey: bobIdentityKeyPair.pubKey,
      signedPreKey: {
        keyId: bobSignedPreKey.keyId,
        publicKey: bobSignedPreKey.keyPair.pubKey,
        signature: bobSignedPreKey.signature,
      },
      preKey: {
        keyId: bobPreKey.keyId,
        publicKey: bobPreKey.keyPair.pubKey,
      },
    };

    await aliceSessionBuilder.processPreKeyBundle(bobBundle);

    const sessionForBob = aliceStorage.getSession(bobAddress.toString());

    expect(sessionForBob).toBeDefined();
    expect(sessionForBob).toBeInstanceOf(Uint8Array);
    expect(sessionForBob!.length).toBeGreaterThan(100);

    const isTrusted = await aliceStorage.isTrustedIdentity(
      "bob",
      bobIdentityKeyPair.pubKey,
      0
    );
    expect(isTrusted).toBe(true);
    expect(aliceStorage.getIdentity("bob")).toEqual(bobIdentityKeyPair.pubKey);
    expect(aliceStorage.identityLoadCount).toBeGreaterThan(0);
    expect(aliceStorage.identitySaveCount).toBeGreaterThan(0);
  });

  it("should persist peer identities across adapter instances", async () => {
    const storage = new AlwaysTrustStorage();
    const bobAddress = new ProtocolAddress("bob-persisted", 1);
    const first = makeBundle();

    await new SessionBuilder(storage, bobAddress).processPreKeyBundle(
      first.bundle
    );
    expect(storage.getIdentity("bob-persisted")).toEqual(
      first.identityKeyPair.pubKey
    );

    const second = makeBundle();
    await new SessionBuilder(storage, bobAddress).processPreKeyBundle(
      second.bundle
    );

    expect(storage.getIdentity("bob-persisted")).toEqual(
      second.identityKeyPair.pubKey
    );
    expect(storage.identityLoadCount).toBeGreaterThanOrEqual(2);
    expect(storage.identitySaveCount).toBeGreaterThanOrEqual(2);
  });

  it("should throw an error for an untrusted identity", async () => {
    const aliceStorage = new FakeStorage();
    const bobAddress = new ProtocolAddress("bob", 1);
    const aliceSessionBuilder = new SessionBuilder(aliceStorage, bobAddress);

    const bobIdentityKeyPair = generateIdentityKeyPair();
    const bobSignedPreKey = generateSignedPreKey(bobIdentityKeyPair, 1);

    const fakeIdentity = generateIdentityKeyPair();
    aliceStorage.trustIdentity("bob", fakeIdentity.pubKey);

    const bobBundle = {
      registrationId: 1234,
      identityKey: bobIdentityKeyPair.pubKey,
      signedPreKey: {
        keyId: bobSignedPreKey.keyId,
        publicKey: bobSignedPreKey.keyPair.pubKey,
        signature: bobSignedPreKey.signature,
      },
    };

    await expect(
      aliceSessionBuilder.processPreKeyBundle(bobBundle)
    ).rejects.toEqual(
      expect.stringContaining("untrusted identity for address bob.1")
    );
  });
});
