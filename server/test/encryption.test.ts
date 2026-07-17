import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { decrypt, encrypt } from '../src/lib/encryption.js';

describe('encryption', () => {
  const key = randomBytes(32);

  it('round-trips plaintext through encrypt/decrypt', () => {
    const plaintext = 'super-secret-aws-key';
    const payload = encrypt(plaintext, key);

    expect(payload).not.toContain(plaintext);
    expect(decrypt(payload, key)).toBe(plaintext);
  });

  it('throws when the ciphertext has been tampered with', () => {
    const payload = encrypt('super-secret-aws-key', key);
    const [iv, authTag, ciphertext] = payload.split(':');
    const tamperedCiphertext = Buffer.from(ciphertext, 'base64');
    tamperedCiphertext[0] = tamperedCiphertext[0] ^ 0xff;
    const tampered = `${iv}:${authTag}:${tamperedCiphertext.toString('base64')}`;

    expect(() => decrypt(tampered, key)).toThrow();
  });

  it('throws when decrypted with the wrong key', () => {
    const payload = encrypt('super-secret-aws-key', key);
    const wrongKey = randomBytes(32);

    expect(() => decrypt(payload, wrongKey)).toThrow();
  });
});
