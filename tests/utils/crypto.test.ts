import { describe, it, expect } from "vitest";
import { encryptToken, decryptToken } from "../../src/utils/crypto";

describe("crypto (AES-256-GCM token encryption)", () => {
  it("round-trips plaintext through encrypt/decrypt", () => {
    const plaintext = "EAAB_some_long_lived_meta_access_token";
    const encrypted = encryptToken(plaintext);

    expect(encrypted.ciphertext).not.toBe(plaintext);
    expect(decryptToken(encrypted)).toBe(plaintext);
  });

  it("produces a different ciphertext (and iv) each time for the same plaintext", () => {
    const a = encryptToken("same-secret");
    const b = encryptToken("same-secret");

    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it("fails to decrypt if the auth tag has been tampered with", () => {
    const encrypted = encryptToken("tamper-test");
    const tampered = { ...encrypted, authTag: encrypted.authTag.replace(/^./, (c) => (c === "a" ? "b" : "a")) };

    expect(() => decryptToken(tampered)).toThrow();
  });

  it("fails to decrypt if the ciphertext has been tampered with", () => {
    const encrypted = encryptToken("tamper-test-2");
    const tampered = { ...encrypted, ciphertext: encrypted.ciphertext.replace(/^./, (c) => (c === "a" ? "b" : "a")) };

    expect(() => decryptToken(tampered)).toThrow();
  });
});
