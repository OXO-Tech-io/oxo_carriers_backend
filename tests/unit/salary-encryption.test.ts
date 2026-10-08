import { describe, it, expect } from 'vitest';
import { encryptSalary, decryptSalary } from '../../src/utils/encryption';

describe('Salary Encryption/Decryption Utility Tests', () => {
  it('should successfully encrypt and decrypt salary amounts', () => {
    const salaries = ['5000.00', '12500.50', '0.00', 10000];
    
    for (const val of salaries) {
      const encrypted = encryptSalary(val);
      expect(encrypted).not.toBeNull();
      expect(encrypted).not.toBe(String(val));
      expect(encrypted).toContain(':');
      
      const decrypted = decryptSalary(encrypted);
      expect(decrypted).toBe(String(val));
    }
  });

  it('should generate unique ciphertexts for the same input due to random IV', () => {
    const input = '4500.00';
    const encrypted1 = encryptSalary(input);
    const encrypted2 = encryptSalary(input);
    
    expect(encrypted1).not.toBe(encrypted2);
    expect(decryptSalary(encrypted1)).toBe(input);
    expect(decryptSalary(encrypted2)).toBe(input);
  });

  it('should handle null and undefined inputs gracefully', () => {
    expect(encryptSalary(null)).toBeNull();
    expect(encryptSalary(undefined)).toBeNull();
    expect(decryptSalary(null)).toBeNull();
    expect(decryptSalary(undefined)).toBeNull();
  });

  it('should return the original string if decrypting unencrypted plaintext', () => {
    const unencrypted = '5000.00';
    expect(decryptSalary(unencrypted)).toBe(unencrypted);
    
    const invalidFormat = 'not-hex-data-without-colon';
    expect(decryptSalary(invalidFormat)).toBe(invalidFormat);
  });
});
