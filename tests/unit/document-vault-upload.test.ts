import { describe, it, expect, vi } from "vitest";
import { BadRequestException } from "@nestjs/common";
import {
  documentVaultUploadMulterOptions,
  ATTACHMENTS_FIELD,
  ATTACHMENTS_MAX_COUNT,
} from "../../src/modules/document-vault/document-vault.upload";

// OCD-495: Document Vault's own multer config narrows the shared uploader's
// allow-list down to exactly JPG/PNG/PDF/DOC/DOCX.
describe("document-vault.upload", () => {
  it("keeps the 'document' field name and a max count of 5", () => {
    expect(ATTACHMENTS_FIELD).toBe("document");
    expect(ATTACHMENTS_MAX_COUNT).toBe(5);
  });

  describe("fileFilter", () => {
    const runFilter = (mimetype: string) => {
      const cb = vi.fn();
      documentVaultUploadMulterOptions.fileFilter!({} as any, { mimetype } as any, cb);
      return cb;
    };

    it.each([
      "image/jpeg",
      "image/jpg",
      "image/png",
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ])("accepts %s", (mimetype) => {
      const cb = runFilter(mimetype);
      expect(cb).toHaveBeenCalledWith(null, true);
    });

    it.each([
      "image/gif",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "text/csv",
      "application/zip",
      "application/x-zip-compressed",
    ])("rejects %s (allowed by the shared uploader, but not Document Vault)", (mimetype) => {
      const cb = runFilter(mimetype);
      expect(cb).toHaveBeenCalledWith(expect.any(BadRequestException), false);
      const [error] = cb.mock.calls[0];
      expect((error as BadRequestException).message).toBe(
        "Invalid file type. Only JPG, PNG, PDF, DOC, and DOCX files are allowed.",
      );
    });

    it("rejects with a BadRequestException so AllExceptionsFilter returns a clean 400", () => {
      const cb = runFilter("application/x-msdownload");
      const [error] = cb.mock.calls[0];
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getStatus()).toBe(400);
    });
  });
});
