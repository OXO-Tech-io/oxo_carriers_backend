import fs from "fs";
import os from "os";
import path from "path";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { UserRole } from "../../src/types";

// Round trip of the real flow behind "Cannot GET /uploads/documents/<uuid>.pdf" on a leave
// request's attachment: multer writes the file to disk -> LeavesService stores the URL ->
// the instance's ephemeral disk is recycled -> the browser requests the URL, which only
// resolves through createDurableUploadFallback if a durable copy was saved at upload time.
// Only the stores (Postgres blob table, GCS, the leave DB) are faked; LeavesService,
// persistDurableUpload and the read-side fallback are the real code.

const { blobStore } = vi.hoisted(() => ({
  blobStore: new Map<string, { mimeType: string; data: Buffer }>(),
}));

vi.mock("../../src/modules/leaves/leave.service", () => ({
  leaveService: { createLeaveRequest: vi.fn() },
}));
vi.mock("../../src/employees/Employee", () => ({ EmployeeModel: { findByEmployeeId: vi.fn() } }));
vi.mock("../../src/common/models/FileBlob", () => ({
  FileBlobModel: {
    persist: vi.fn(async (file: { filename: string; mimetype: string; path: string }) => {
      blobStore.set(file.filename, { mimeType: file.mimetype, data: fs.readFileSync(file.path) });
    }),
    get: vi.fn(async (filename: string) => blobStore.get(filename) ?? null),
  },
}));
vi.mock("../../src/modules/medical-insurance/MedicalInsurance", () => ({
  MedicalInsuranceModel: { getDocumentBlob: vi.fn().mockResolvedValue(null) },
}));
vi.mock("../../src/lib/storage/gcsStorage", () => ({
  isSecureBucketConfigured: vi.fn().mockReturnValue(false),
  uploadPrivateObject: vi.fn(),
  downloadPrivateObject: vi.fn(),
}));
vi.mock("../../src/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { leaveService } from "../../src/modules/leaves/leave.service";
import { LeavesService } from "../../src/modules/leaves/leaves.service";
import { createDurableUploadFallback } from "../../src/common/upload/serve-durable-upload-fallback";
import { FILE_CATEGORIES } from "../../src/common/constants/fileCategories";

const createLeaveMock = leaveService.createLeaveRequest as unknown as ReturnType<typeof vi.fn>;

const employee = { userId: 1, employeeId: "EMP1", role: UserRole.EMPLOYEE } as any;
const body = { leave_type_id: 1, start_date: "2026-08-03", end_date: "2026-08-04" };
const PDF_BYTES = Buffer.from("%PDF-1.4 medical certificate");

/** What the browser's GET /uploads/documents/:filename ends up as, once express.static has missed. */
async function requestUpload(filename: string) {
  const res = { setHeader: vi.fn(), send: vi.fn() };
  const next = vi.fn();
  await createDurableUploadFallback(FILE_CATEGORIES.DOCUMENTS)({ params: { filename } } as any, res as any, next);
  return { res, next };
}

describe("leave request attachment durability", () => {
  let tmpDir: string;
  let file: Express.Multer.File;

  beforeEach(() => {
    blobStore.clear();
    vi.clearAllMocks();
    createLeaveMock.mockResolvedValue({ id: 1 });
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "leave-upload-"));
    const diskPath = path.join(tmpDir, "5a773704-fd0e-493c-8a18-09a883772d7c.pdf");
    fs.writeFileSync(diskPath, PDF_BYTES);
    file = {
      filename: "5a773704-fd0e-493c-8a18-09a883772d7c.pdf",
      mimetype: "application/pdf",
      path: diskPath,
    } as Express.Multer.File;
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("serves the attachment after the instance's disk copy is gone", async () => {
    await new LeavesService().createLeaveRequest(employee, body, file);
    expect(createLeaveMock).toHaveBeenCalledWith("EMP1", expect.anything(), `/uploads/documents/${file.filename}`);

    fs.unlinkSync(file.path); // Cloud Run recycles the instance - the on-disk upload vanishes

    const { res, next } = await requestUpload(file.filename);
    expect(next).not.toHaveBeenCalled(); // would be the "Cannot GET /uploads/documents/..." 404
    expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "application/pdf");
    expect(res.send).toHaveBeenCalledWith(PDF_BYTES);
  });

  it("falls through to a 404 for an upload that was never persisted (the reported symptom)", async () => {
    const { res, next } = await requestUpload(file.filename);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.send).not.toHaveBeenCalled();
  });

  it("leaves no durable copy behind when the leave request is rejected", async () => {
    createLeaveMock.mockRejectedValue(new Error("Insufficient leave balance"));
    await expect(new LeavesService().createLeaveRequest(employee, body, file)).rejects.toThrow();
    expect(blobStore.size).toBe(0);
  });
});
