import { z } from 'zod';

// Accepts either a real array (JSON body) or a JSON-encoded string (multipart
// form-data, required for file attachments) - same shape as
// communication.validator.ts's idArrayField.
const idArrayField = z
  .union([z.array(z.coerce.number().int().positive()), z.string()])
  .optional()
  .transform((v) => {
    if (v === undefined || v === '') return [];
    return Array.isArray(v) ? v : JSON.parse(v);
  })
  .pipe(z.array(z.coerce.number().int().positive()));

// Multipart form-data (required whenever attachments are included) encodes
// booleans as plain strings, so this accepts either the native JSON type or
// its string form - same idiom as communication.validator.ts's booleanField.
const booleanField = z
  .union([z.boolean(), z.string()])
  .optional()
  .transform((v) => v === true || v === 'true');

export const createDocumentSchema = z
  .object({
    title: z.string().min(1, 'Title is required').max(255),
    description: z.string().max(2000).optional().nullable(),
    targetType: z.enum(['individual', 'all']),
    individualEmployeeIds: idArrayField,
    // OCD-500: required on create - mirrors tbl_documents.version's
    // varchar(50) NOT NULL column.
    version: z.string().min(1, 'Version is required').max(50, 'Version must be 50 characters or less'),
    isMandatoryViewing: booleanField,
  })
  .refine((data) => data.targetType !== 'individual' || data.individualEmployeeIds.length > 0, {
    message: 'At least one employee is required when targeting specific employees',
    path: ['individualEmployeeIds'],
  });
export type CreateDocumentInput = z.infer<typeof createDocumentSchema>;
