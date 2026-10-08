import { describe, it, expect, vi, beforeEach } from "vitest";

const { readFileSyncMock } = vi.hoisted(() => ({ readFileSyncMock: vi.fn() }));

vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  return { ...actual, default: { ...actual, readFileSync: readFileSyncMock } };
});
vi.mock("../../src/common/models/FileBlob", () => ({
  FileBlobModel: { persist: vi.fn() },
}));
vi.mock("../../src/lib/storage/gcsStorage", () => ({
  isSecureBucketConfigured: vi.fn(),
  uploadPrivateObject: vi.fn(),
}));
vi.mock("../../src/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { persistDurableUpload } from "../../src/common/upload/persist-durable-upload";
import { FileBlobModel } from "../../src/common/models/FileBlob";
import { isSecureBucketConfigured, uploadPrivateObject } from "../../src/lib/storage/gcsStorage";
import { logger } from "../../src/lib/logger";

const persistMock = FileBlobModel.persist as unknown as ReturnType<typeof vi.fn>;
const bucketConfiguredMock = isSecureBucketConfigured as unknown as ReturnType<typeof vi.fn>;
const uploadMock = uploadPrivateObject as unknown as ReturnType<typeof vi.fn>;
const loggerErrorMock = logger.error as unknown as ReturnType<typeof vi.fn>;

const file = { filename: "abc.pdf", mimetype: "application/pdf", path: "/tmp/abc.pdf" } as any;

describe("persistDurableUpload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    persistMock.mockResolvedValue(undefined);
    uploadMock.mockResolvedValue(undefined);
    bucketConfiguredMock.mockReturnValue(false);
    readFileSyncMock.mockReturnValue(Buffer.from("pdf-bytes"));
  });

  it("always writes the Postgres copy", async () => {
    await persistDurableUpload(file, "documents");
    expect(persistMock).toHaveBeenCalledWith(file);
  });

  it("skips cloud storage, and never reads the file for it, when no bucket is configured", async () => {
    await persistDurableUpload(file, "documents");
    expect(uploadMock).not.toHaveBeenCalled();
    expect(readFileSyncMock).not.toHaveBeenCalled();
  });

  it("also uploads to the bucket under uploads/<category>/<filename> - the key the read-side fallback looks up", async () => {
    bucketConfiguredMock.mockReturnValue(true);
    await persistDurableUpload(file, "documents");
    expect(readFileSyncMock).toHaveBeenCalledWith("/tmp/abc.pdf");
    expect(uploadMock).toHaveBeenCalledWith("uploads/documents/abc.pdf", Buffer.from("pdf-bytes"), "application/pdf");
  });

  it("honours the category for the bucket key", async () => {
    bucketConfiguredMock.mockReturnValue(true);
    await persistDurableUpload({ ...file, filename: "pic.png", mimetype: "image/png" }, "others");
    expect(uploadMock).toHaveBeenCalledWith("uploads/others/pic.png", expect.any(Buffer), "image/png");
  });

  it("does not throw, and logs, when the Postgres copy fails - the request already succeeded", async () => {
    persistMock.mockRejectedValue(new Error("db down"));
    await expect(persistDurableUpload(file, "documents")).resolves.toBeUndefined();
    expect(loggerErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({ filename: "abc.pdf" }),
      "Failed to persist uploaded file to the database",
    );
  });

  it("still writes the Postgres copy when the bucket upload fails, and logs it", async () => {
    bucketConfiguredMock.mockReturnValue(true);
    uploadMock.mockRejectedValue(new Error("gcs down"));
    await expect(persistDurableUpload(file, "documents")).resolves.toBeUndefined();
    expect(persistMock).toHaveBeenCalledWith(file);
    expect(loggerErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({ filename: "abc.pdf" }),
      "Failed to persist uploaded file to cloud storage",
    );
  });

  it("does not throw when the disk file is already unreadable (the bucket copy is skipped, the DB copy is still attempted)", async () => {
    bucketConfiguredMock.mockReturnValue(true);
    readFileSyncMock.mockImplementation(() => {
      throw new Error("ENOENT");
    });
    await expect(persistDurableUpload(file, "documents")).resolves.toBeUndefined();
    expect(persistMock).toHaveBeenCalledWith(file);
    expect(uploadMock).not.toHaveBeenCalled();
    expect(loggerErrorMock).toHaveBeenCalled();
  });
});
