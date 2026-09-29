import { describe, it, expect } from "vitest";
import { BadRequestException } from "@nestjs/common";
import { communicationAttachmentsMulterOptions } from "../../src/modules/communications/communications.upload";

// OCD-516: unsupported attachment mimetypes must surface as a clean 400
// (BadRequestException), not a raw Error that AllExceptionsFilter can only
// turn into an opaque 500. Exercised directly against the multer
// `fileFilter` option (no Nest TestingModule/HTTP harness needed, matching
// this module's plain-mock testing style elsewhere).
describe("communicationAttachmentsMulterOptions.fileFilter", () => {
  const runFilter = (mimetype: string): Promise<{ error: unknown; accepted: boolean | undefined }> =>
    new Promise((resolve) => {
      communicationAttachmentsMulterOptions.fileFilter!(
        {} as any,
        { mimetype } as any,
        (error, accepted) => resolve({ error, accepted }),
      );
    });

  it("rejects an unsupported mimetype with a BadRequestException carrying a clean message", async () => {
    const { error, accepted } = await runFilter("application/x-msdownload");
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).message).toBe(
      "Unsupported file type. Please upload a JPG, PNG, Word, PDF, or spreadsheet file.",
    );
    expect(accepted).toBe(false);
  });

  it("accepts an allowed mimetype without error", async () => {
    const { error, accepted } = await runFilter("application/pdf");
    expect(error).toBeNull();
    expect(accepted).toBe(true);
  });
});
