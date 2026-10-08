import { describe, it, expect } from "vitest";
import { pgpEncrypt, pgpDecrypt, getPiiEncryptionKey } from "../../src/utils/pgpCrypto";
import { employeePii } from "../../src/db/schema";

// Flattens a drizzle SQL object's queryChunks into raw params/text so we can
// assert on the generated SQL fragment without a live DB connection.
function flattenChunks(sqlObj: any): unknown[] {
  return sqlObj.queryChunks.flatMap((chunk: any) =>
    chunk && typeof chunk === "object" && "value" in chunk ? chunk.value : [chunk],
  );
}

describe("pgpCrypto utils", () => {
  it("getPiiEncryptionKey returns the configured key", () => {
    expect(getPiiEncryptionKey()).toEqual(expect.any(String));
    expect(getPiiEncryptionKey().length).toBeGreaterThan(0);
  });

  describe("pgpEncrypt", () => {
    it("returns null for null or undefined input", () => {
      expect(pgpEncrypt(null)).toBeNull();
      expect(pgpEncrypt(undefined)).toBeNull();
    });

    it("builds a pgp_sym_encrypt SQL fragment containing the plaintext and key", () => {
      const result = pgpEncrypt("secret-value");
      expect(result).not.toBeNull();
      const flat = flattenChunks(result);
      expect(flat).toContain("secret-value");
      expect(flat).toContain(getPiiEncryptionKey());
      expect(flat.join(" ")).toContain("pgp_sym_encrypt");
    });

    it("accepts an empty string as a valid (non-null) value", () => {
      const result = pgpEncrypt("");
      expect(result).not.toBeNull();
    });
  });

  describe("pgpDecrypt", () => {
    it("builds a CASE WHEN ... pgp_sym_decrypt SQL fragment for a given column", () => {
      const result = pgpDecrypt(employeePii.passportNumber as any);
      const flat = flattenChunks(result);
      expect(flat.join(" ")).toContain("pgp_sym_decrypt");
      expect(flat.join(" ")).toContain("CASE WHEN");
      expect(flat).toContain(getPiiEncryptionKey());
    });
  });
});
