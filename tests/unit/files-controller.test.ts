import { describe, it, expect, vi, beforeEach } from "vitest";
import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";

vi.mock("fs", () => ({
  default: {
    existsSync: vi.fn(),
    statSync: vi.fn(),
    createReadStream: vi.fn(),
  },
}));

import fs from "fs";
import { FilesController } from "../../src/common/files/files.controller";

const fsMock = fs as unknown as Record<string, ReturnType<typeof vi.fn>>;

const createRes = () => ({ setHeader: vi.fn() }) as any;

describe("FilesController", () => {
  let controller: FilesController;

  beforeEach(() => {
    vi.clearAllMocks();
    controller = new FilesController();
  });

  it("rejects a request with no category (query param omitted)", async () => {
    await expect(controller.download("doc.pdf", undefined, createRes())).rejects.toThrow(BadRequestException);
  });

  it("forbids the payroll-sensitive salary-slips category outright", async () => {
    await expect(controller.download("slip.pdf", "salary-slips", createRes())).rejects.toThrow(ForbiddenException);
    expect(fsMock.existsSync).not.toHaveBeenCalled();
  });

  it("rejects a category outside the allowed set", async () => {
    await expect(controller.download("doc.pdf", "not-a-real-category", createRes())).rejects.toThrow(
      BadRequestException,
    );
  });

  it("rejects a filename containing path separators or traversal sequences", async () => {
    await expect(controller.download("../../etc/passwd", "documents", createRes())).rejects.toThrow(
      BadRequestException,
    );
  });

  it("returns NotFoundException when the resolved file doesn't exist on disk", async () => {
    fsMock.existsSync.mockReturnValue(false);
    await expect(controller.download("missing.pdf", "documents", createRes())).rejects.toThrow(NotFoundException);
  });

  it("streams an existing file with the right content headers", async () => {
    fsMock.existsSync.mockReturnValue(true);
    fsMock.statSync.mockReturnValue({ isFile: () => true });
    const pipe = vi.fn();
    fsMock.createReadStream.mockReturnValue({ pipe });

    const res = createRes();
    await controller.download("report.pdf", "documents", res);

    expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "application/pdf");
    expect(res.setHeader).toHaveBeenCalledWith("Content-Disposition", 'inline; filename="report.pdf"');
    expect(pipe).toHaveBeenCalledWith(res);
  });
});
