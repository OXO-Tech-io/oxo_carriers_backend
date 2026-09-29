import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

vi.mock("../../src/modules/medical-insurance/MedicalInsurance", () => ({
  MedicalInsuranceModel: { getDocumentBlob: vi.fn() },
}));

vi.mock("../../src/common/models/FileBlob", () => ({
  FileBlobModel: { get: vi.fn() },
}));

vi.mock("../../src/lib/storage/gcsStorage", () => ({
  isSecureBucketConfigured: vi.fn(),
  downloadPrivateObject: vi.fn(),
}));

import { logger } from "../../src/lib/logger";
import { MedicalInsuranceModel } from "../../src/modules/medical-insurance/MedicalInsurance";
import { FileBlobModel } from "../../src/common/models/FileBlob";
import { isSecureBucketConfigured, downloadPrivateObject } from "../../src/lib/storage/gcsStorage";
import { createDurableUploadFallback } from "../../src/common/upload/serve-durable-upload-fallback";
import { FILE_CATEGORIES } from "../../src/common/constants/fileCategories";

const getDocumentBlobMock = MedicalInsuranceModel.getDocumentBlob as unknown as ReturnType<typeof vi.fn>;
const getBlobMock = FileBlobModel.get as unknown as ReturnType<typeof vi.fn>;
const isSecureBucketConfiguredMock = isSecureBucketConfigured as unknown as ReturnType<typeof vi.fn>;
const downloadPrivateObjectMock = downloadPrivateObject as unknown as ReturnType<typeof vi.fn>;
const loggerErrorMock = logger.error as unknown as ReturnType<typeof vi.fn>;

function makeRes() {
  return {
    setHeader: vi.fn(),
    send: vi.fn(),
  } as any;
}

describe("createDurableUploadFallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("serves the GCS object first when a bucket is configured", async () => {
    isSecureBucketConfiguredMock.mockReturnValue(true);
    downloadPrivateObjectMock.mockResolvedValue(Buffer.from("data"));
    const handler = createDurableUploadFallback(FILE_CATEGORIES.DOCUMENTS);
    const req = { params: { filename: "abc.pdf" } } as any;
    const res = makeRes();
    const next = vi.fn();

    await handler(req, res, next);

    expect(downloadPrivateObjectMock).toHaveBeenCalledWith("uploads/documents/abc.pdf");
    expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "application/pdf");
    expect(res.send).toHaveBeenCalledWith(Buffer.from("data"));
    expect(getDocumentBlobMock).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it("falls back to the Postgres blob tables on a GCS not-found error, without logging", async () => {
    isSecureBucketConfiguredMock.mockReturnValue(true);
    downloadPrivateObjectMock.mockRejectedValue(Object.assign(new Error("not found"), { code: 404 }));
    getDocumentBlobMock.mockResolvedValue(null);
    getBlobMock.mockResolvedValue({ mimeType: "application/pdf", data: Buffer.from("legacy") });
    const handler = createDurableUploadFallback(FILE_CATEGORIES.DOCUMENTS);
    const req = { params: { filename: "abc.pdf" } } as any;
    const res = makeRes();
    const next = vi.fn();

    await handler(req, res, next);

    expect(loggerErrorMock).not.toHaveBeenCalled();
    expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "application/pdf");
    expect(res.send).toHaveBeenCalledWith(Buffer.from("legacy"));
  });

  it("falls back to Postgres and logs when GCS fails for a reason other than not-found", async () => {
    isSecureBucketConfiguredMock.mockReturnValue(true);
    downloadPrivateObjectMock.mockRejectedValue(new Error("bucket unreachable"));
    getDocumentBlobMock.mockResolvedValue(null);
    getBlobMock.mockResolvedValue({ mimeType: "image/png", data: Buffer.from("legacy") });
    const handler = createDurableUploadFallback(FILE_CATEGORIES.OTHERS);
    const req = { params: { filename: "xyz.png" } } as any;
    const res = makeRes();
    const next = vi.fn();

    await handler(req, res, next);

    expect(loggerErrorMock).toHaveBeenCalled();
    expect(res.send).toHaveBeenCalledWith(Buffer.from("legacy"));
  });

  it("goes straight to Postgres when no bucket is configured", async () => {
    isSecureBucketConfiguredMock.mockReturnValue(false);
    getDocumentBlobMock.mockResolvedValue(null);
    getBlobMock.mockResolvedValue({ mimeType: "application/pdf", data: Buffer.from("legacy") });
    const handler = createDurableUploadFallback(FILE_CATEGORIES.DOCUMENTS);
    const req = { params: { filename: "abc.pdf" } } as any;
    const res = makeRes();
    const next = vi.fn();

    await handler(req, res, next);

    expect(downloadPrivateObjectMock).not.toHaveBeenCalled();
    expect(res.send).toHaveBeenCalledWith(Buffer.from("legacy"));
  });

  it("calls next() when neither GCS nor Postgres has a copy", async () => {
    isSecureBucketConfiguredMock.mockReturnValue(false);
    getDocumentBlobMock.mockResolvedValue(null);
    getBlobMock.mockResolvedValue(null);
    const handler = createDurableUploadFallback(FILE_CATEGORIES.DOCUMENTS);
    const req = { params: { filename: "missing.pdf" } } as any;
    const res = makeRes();
    const next = vi.fn();

    await handler(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(res.send).not.toHaveBeenCalled();
  });
});
