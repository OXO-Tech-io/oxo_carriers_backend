import path from "path";

// Root directory for multer disk-storage uploads (see
// document-upload.options.ts and its per-module duplicates). Shared here so
// every consumer that needs to resolve an on-disk upload path (FilesController's
// download route, cleanup-stored-file.ts) derives it from the same place
// instead of re-joining process.cwd() with "uploads" themselves.
export const UPLOADS_ROOT = path.join(process.cwd(), "uploads");

// Subdirectories under uploads/ used by the generic document-or-image
// upload pattern (src/common/upload/document-upload.options.ts and its
// per-module duplicates) and accepted as the `category` query param by
// FilesController's guarded download route.
export const FILE_CATEGORIES = {
  DOCUMENTS: "documents",
  OTHERS: "others",
} as const;

export type FileCategory = (typeof FILE_CATEGORIES)[keyof typeof FILE_CATEGORIES];

// Salary slip PDFs live in their own uploads/ subdirectory but are
// payroll-sensitive and must never be served through FilesController's
// generic pass-through - only through SalaryController's guarded,
// ownership-checked endpoint (which streams a freshly generated buffer).
export const RESTRICTED_FILE_CATEGORY = "salary-slips";

// Extension -> Content-Type, used by FilesController's disk read and by the
// GCS-backed durable-upload fallback (serve-durable-upload-fallback.ts) - the
// latter infers content-type from the filename instead of an extra GCS
// metadata round trip, matching what this map already does for disk reads.
export const CONTENT_TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".csv": "text/csv",
  ".zip": "application/zip",
};
