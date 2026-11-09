import pool from '../config/database';
import { logger } from '../lib/logger';
import { decryptPII } from '../utils/encryption';

// One-off, idempotent: bank_branch_code and swift_code are public bank identifiers, not PII, and
// are now stored in plaintext. Rows written before that change hold AES ciphertext ("<32 hex iv>:<hex>");
// this converts them. Re-running is safe - plaintext rows no longer match the ciphertext pattern.
//
//   npx ts-node src/scripts/decryptBankCodes.ts            (dry run: prints counts only)
//   npx ts-node src/scripts/decryptBankCodes.ts --apply    (writes the changes)
const CIPHERTEXT = /^[0-9a-f]{32}:[0-9a-f]+$/i;
const COLUMNS = ['bank_branch_code', 'swift_code'] as const;

async function decryptBankCodes() {
  const apply = process.argv.includes('--apply');
  try {
    let converted = 0;
    let skipped = 0;

    for (const column of COLUMNS) {
      const { rows } = await pool.query(`SELECT id, ${column} AS value FROM tbl_employee WHERE ${column} IS NOT NULL`);

      for (const row of rows) {
        if (!CIPHERTEXT.test(row.value)) continue;

        const plain = decryptPII(row.value);
        // decryptPII hands the input back when it cannot decrypt - never write that back.
        if (!plain || plain === row.value) {
          skipped++;
          logger.warn({ id: row.id, column }, 'Could not decrypt value; left unchanged');
          continue;
        }

        if (apply) await pool.query(`UPDATE tbl_employee SET ${column} = $1 WHERE id = $2`, [plain, row.id]);
        converted++;
      }
    }

    logger.info(
      { converted, skipped, mode: apply ? 'applied' : 'dry run' },
      apply ? 'Bank code columns converted to plaintext' : 'Dry run only - re-run with --apply to write',
    );
    process.exit(0);
  } catch (error: any) {
    logger.error({ err: error }, 'Error converting bank code columns');
    process.exit(1);
  }
}

decryptBankCodes();
