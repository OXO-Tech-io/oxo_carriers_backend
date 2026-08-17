import { describe, it, expect, vi, beforeEach } from "vitest";
import { AppError } from "../../src/utils/AppError";

vi.mock("../../src/modules/document-vault/Document", () => ({
  DocumentModel: {
    create: vi.fn(),
    findById: vi.fn(),
    listAll: vi.fn(),
    deleteById: vi.fn(),
  },
}));
vi.mock("../../src/modules/document-vault/DocumentRecipient", () => ({
  DocumentRecipientModel: {
    createMany: vi.fn(),
    listByDocumentId: vi.fn(),
    listForEmployee: vi.fn(),
  },
}));
vi.mock("../../src/common/models/Attachment", () => ({
  AttachmentModel: {
    createMany: vi.fn(),
    findByEntity: vi.fn(),
    findByEntityMany: vi.fn(),
    deleteByEntity: vi.fn(),
  },
}));
vi.mock("../../src/employees/Employee", () => ({
  EmployeeModel: {
    findByIds: vi.fn(),
    findById: vi.fn(),
  },
}));

import { DocumentModel } from "../../src/modules/document-vault/Document";
import { DocumentRecipientModel } from "../../src/modules/document-vault/DocumentRecipient";
import { AttachmentModel } from "../../src/common/models/Attachment";
import { EmployeeModel } from "../../src/employees/Employee";
import { documentService } from "../../src/modules/document-vault/document.service";

const dm = DocumentModel as unknown as Record<string, ReturnType<typeof vi.fn>>;
const drm = DocumentRecipientModel as unknown as Record<string, ReturnType<typeof vi.fn>>;
const am = AttachmentModel as unknown as Record<string, ReturnType<typeof vi.fn>>;
const em = EmployeeModel as unknown as Record<string, ReturnType<typeof vi.fn>>;

describe("documentService (core)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("create", () => {
    it("rejects an individual target with no employees", async () => {
      await expect(documentService.create("T", null, "individual", [], 9, [])).rejects.toMatchObject({
        statusCode: 400,
      });
      expect(dm.create).not.toHaveBeenCalled();
    });

    it("resolves numeric ids to business employeeIds (deduped) before inserting recipients", async () => {
      dm.create.mockResolvedValue({ id: 100, title: "T" });
      em.findByIds.mockResolvedValue([
        { id: 1, employeeId: "EMP1" },
        { id: 2, employeeId: "EMP2" },
        { id: 2, employeeId: "EMP2" },
      ]);
      drm.createMany.mockResolvedValue([]);

      const result = await documentService.create("T", "desc", "individual", [1, 2], 9, []);

      expect(em.findByIds).toHaveBeenCalledWith([1, 2]);
      expect(drm.createMany).toHaveBeenCalledWith(100, ["EMP1", "EMP2"]);
      expect(result).toEqual({ id: 100, title: "T" });
    });

    it("does not create recipient rows for an 'all' target", async () => {
      dm.create.mockResolvedValue({ id: 101 });
      await documentService.create("T", null, "all", [], 9, []);
      expect(drm.createMany).not.toHaveBeenCalled();
    });

    it("creates attachments when files are provided", async () => {
      dm.create.mockResolvedValue({ id: 102 });
      await documentService.create("T", null, "all", [], 9, [{ buffer: Buffer.from("x") } as any]);
      expect(am.createMany).toHaveBeenCalledWith("document_vault", 102, expect.any(Array), 9);
    });
  });

  describe("listAll", () => {
    it("enriches each document with recipient ids and attachments", async () => {
      dm.listAll.mockResolvedValue([{ id: 1, title: "T" }]);
      drm.listByDocumentId.mockResolvedValue([{ id: 1, documentId: 1, employeeId: "EMP1" }]);
      am.findByEntity.mockResolvedValue([{ id: 1, entityId: 1, fileName: "a.pdf" }]);

      const [result] = await documentService.listAll();
      expect(result.recipientEmployeeIds).toEqual(["EMP1"]);
      expect(result.attachments).toEqual([{ id: 1, entityId: 1, fileName: "a.pdf" }]);
    });
  });

  describe("listForEmployee", () => {
    it("stitches attachments onto the merged (all + individual) document list", async () => {
      drm.listForEmployee.mockResolvedValue([{ id: 1 }, { id: 2 }]);
      am.findByEntityMany.mockResolvedValue([{ id: 10, entityId: 1, fileName: "a.pdf" }]);

      const result = await documentService.listForEmployee("EMP1");
      expect(drm.listForEmployee).toHaveBeenCalledWith("EMP1");
      expect(result[0].attachments).toEqual([{ id: 10, entityId: 1, fileName: "a.pdf" }]);
      expect(result[1].attachments).toEqual([]);
    });
  });

  describe("listForEmployeeByInternalId", () => {
    it("throws when the employee has no business employeeId assigned", async () => {
      em.findById.mockResolvedValue({ id: 5, employeeId: null });
      await expect(documentService.listForEmployeeByInternalId(5)).rejects.toMatchObject({ statusCode: 400 });
    });

    it("resolves the internal id then reuses the merged employee view", async () => {
      em.findById.mockResolvedValue({ id: 5, employeeId: "EMP5" });
      drm.listForEmployee.mockResolvedValue([{ id: 1 }]);
      am.findByEntityMany.mockResolvedValue([]);

      await documentService.listForEmployeeByInternalId(5);
      expect(drm.listForEmployee).toHaveBeenCalledWith("EMP5");
    });
  });

  describe("delete", () => {
    it("throws a 404 AppError when the document doesn't exist", async () => {
      dm.findById.mockResolvedValue(null);
      await expect(documentService.delete(1)).rejects.toThrow(AppError);
      await expect(documentService.delete(1)).rejects.toMatchObject({ statusCode: 404 });
    });

    it("deletes attachments and the document", async () => {
      dm.findById.mockResolvedValue({ id: 1 });
      await documentService.delete(1);
      expect(am.deleteByEntity).toHaveBeenCalledWith("document_vault", 1);
      expect(dm.deleteById).toHaveBeenCalledWith(1);
    });
  });
});
