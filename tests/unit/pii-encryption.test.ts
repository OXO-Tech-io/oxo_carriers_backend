import { describe, it, expect } from 'vitest';
import { encryptPII, decryptPII } from '../../src/utils/encryption';

describe('PII Encryption/Decryption Utility Tests', () => {
  it('should successfully encrypt and decrypt PII data', () => {
    const testData = ['Bank of America', 'John Doe', '1234567890', '1250.75', 4500];
    
    for (const val of testData) {
      const encrypted = encryptPII(val);
      expect(encrypted).not.toBeNull();
      expect(encrypted).not.toBe(String(val));
      expect(encrypted).toContain(':');
      
      const decrypted = decryptPII(encrypted);
      expect(decrypted).toBe(String(val));
    }
  });

  it('should generate unique ciphertexts for the same input due to random IV', () => {
    const input = 'Sensitive PII';
    const encrypted1 = encryptPII(input);
    const encrypted2 = encryptPII(input);
    
    expect(encrypted1).not.toBe(encrypted2);
    expect(decryptPII(encrypted1)).toBe(input);
    expect(decryptPII(encrypted2)).toBe(input);
  });

  it('should handle null and undefined inputs gracefully', () => {
    expect(encryptPII(null)).toBeNull();
    expect(encryptPII(undefined)).toBeNull();
    expect(decryptPII(null)).toBeNull();
    expect(decryptPII(undefined)).toBeNull();
  });

  it('should return the original string if decrypting unencrypted plaintext', () => {
    const unencrypted = 'Plain text';
    expect(decryptPII(unencrypted)).toBe(unencrypted);
    
    const invalidFormat = 'not-hex-data-without-colon';
    expect(decryptPII(invalidFormat)).toBe(invalidFormat);
  });
});
