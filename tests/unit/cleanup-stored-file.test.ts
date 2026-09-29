import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("fs/promises", () => ({
  default: { unlink: vi.fn() },
  unlink: vi.fn(),
}));

vi.mock("../../src/common/models/FileBlob", () => ({
  FileBlobModel: { deleteByFilename: vi.fn() },
}));

vi.mock("../../src/lib/storage/gcsStorage", () => ({
  isSecureBucketConfigured: vi.fn(),
  deletePrivateObject: vi.fn(),
}));

import fs from "fs/promises";
import { FileBlobModel } from "../../src/common/models/FileBlob";
import { isSecureBucketConfigured, deletePrivateObject } from "../../src/lib/storage/gcsStorage";
import { cleanupStoredFile } from "../../src/common/upload/cleanup-stored-file";

const unlinkMock = fs.unlink as unknown as ReturnType<typeof vi.fn>;
const deleteByFilenameMock = FileBlobModel.deleteByFilename as unknown as ReturnType<typeof vi.fn>;
const isSecureBucketConfiguredMock = isSecureBucketConfigured as unknown as ReturnType<typeof vi.fn>;
const deletePrivateObjectMock = deletePrivateObject as unknown as ReturnType<typeof vi.fn>;

describe("cleanupStoredFile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    unlinkMock.mockResolvedValue(undefined);
    deleteByFilenameMock.mockResolvedValue(undefined);
  });

  it("deletes the on-disk file and the Postgres blob row regardless of GCS configuration", async () => {
    isSecureBucketConfiguredMock.mockReturnValue(false);
    await cleanupStoredFile("/uploads/documents/abc.pdf");
    expect(unlinkMock).toHaveBeenCalled();
    expect(deleteByFilenameMock).toHaveBeenCalledWith("abc.pdf");
    expect(deletePrivateObjectMock).not.toHaveBeenCalled();
  });

  it("also deletes the GCS object when a bucket is configured, using the fileUrl-derived key", async () => {
    isSecureBucketConfiguredMock.mockReturnValue(true);
    deletePrivateObjectMock.mockResolvedValue(undefined);
    await cleanupStoredFile("/uploads/documents/abc.pdf");
    expect(deletePrivateObjectMock).toHaveBeenCalledWith("uploads/documents/abc.pdf");
  });

  it("uses the others category for a fileUrl under uploads/others", async () => {
    isSecureBucketConfiguredMock.mockReturnValue(true);
    deletePrivateObjectMock.mockResolvedValue(undefined);
    await cleanupStoredFile("/uploads/others/xyz.png");
    expect(deletePrivateObjectMock).toHaveBeenCalledWith("uploads/others/xyz.png");
  });

  it("logs but does not throw when the GCS delete fails", async () => {
    isSecureBucketConfiguredMock.mockReturnValue(true);
    deletePrivateObjectMock.mockRejectedValue(new Error("boom"));
    await expect(cleanupStoredFile("/uploads/documents/abc.pdf")).resolves.toBeUndefined();
    expect(deleteByFilenameMock).toHaveBeenCalledWith("abc.pdf");
  });
});
