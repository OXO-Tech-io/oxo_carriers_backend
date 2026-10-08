import { describe, it, expect, vi, beforeEach } from "vitest";
// NOTE: AppError's constructor calls Object.setPrototypeOf(this, AppError.prototype),
// which resets the prototype chain set by `new.target` for every subclass
// (NotFoundError/ForbiddenError/etc). That makes `instanceof NotFoundError`
// always false even for genuine NotFoundError instances - only
// `instanceof AppError` (plus statusCode/message) reliably identifies them.
import { AppError } from "../../src/utils/AppError";

vi.mock("../../src/modules/communications/Communication", () => ({
  CommunicationModel: {
    create: vi.fn(),
    findById: vi.fn(),
    listAll: vi.fn(),
    deleteById: vi.fn(),
  },
}));
vi.mock("../../src/modules/communications/CommunicationRecipient", () => ({
  CommunicationRecipientModel: {
    createMany: vi.fn(),
    listByCommunicationId: vi.fn(),
    listForUser: vi.fn(),
    findByCommunicationAndUser: vi.fn(),
    markResponded: vi.fn(),
    markEmailSent: vi.fn(),
    getReportRows: vi.fn(),
  },
}));
vi.mock("../../src/common/models/Attachment", () => ({
  AttachmentModel: {
    createMany: vi.fn(),
    deleteByEntity: vi.fn(),
    findByEntity: vi.fn(),
    findByEntityMany: vi.fn(),
  },
}));
vi.mock("../../src/employees/Employee", () => ({
  EmployeeModel: {
    findByIds: vi.fn(),
    findByEmployeeIds: vi.fn(),
    findByEmployeeId: vi.fn(),
  },
}));
vi.mock("../../src/modules/groups/group.service", () => ({
  groupService: { resolveMemberUserIds: vi.fn() },
}));
vi.mock("../../src/config/email", () => ({
  sendCommunicationEmail: vi.fn(),
}));
vi.mock("../../src/modules/notifications/notification.service", () => ({
  notificationService: { notify: vi.fn() },
}));
vi.mock("../../src/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { CommunicationModel } from "../../src/modules/communications/Communication";
import { CommunicationRecipientModel } from "../../src/modules/communications/CommunicationRecipient";
import { AttachmentModel } from "../../src/common/models/Attachment";
import { EmployeeModel } from "../../src/employees/Employee";
import { groupService } from "../../src/modules/groups/group.service";
import { communicationService } from "../../src/modules/communications/communication.service";
import { formatExportTimestamp } from "../../src/utils/helpers";

const cm = CommunicationModel as unknown as Record<string, ReturnType<typeof vi.fn>>;
const crm = CommunicationRecipientModel as unknown as Record<string, ReturnType<typeof vi.fn>>;
const am = AttachmentModel as unknown as Record<string, ReturnType<typeof vi.fn>>;
const em = EmployeeModel as unknown as Record<string, ReturnType<typeof vi.fn>>;
const gs = groupService as unknown as Record<string, ReturnType<typeof vi.fn>>;

const flush = () => new Promise((resolve) => setImmediate(resolve));

describe("communicationService (core)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default to no attachments so existing listAll/listMine assertions below
    // (which don't care about attachments) don't have to opt in individually;
    // the OCD-525 tests further down override this per-case.
    am.findByEntityMany.mockResolvedValue([]);
  });

  describe("create", () => {
    it("merges direct recipients with resolved group members (deduped) and creates recipient rows", async () => {
      gs.resolveMemberUserIds.mockResolvedValue([2, 3]);
      cm.create.mockResolvedValue({ id: 100, title: "T", body: "B" });
      em.findByIds.mockResolvedValue([
        { id: 1, employeeId: "EMP1" },
        { id: 2, employeeId: "EMP2" },
        { id: 3, employeeId: "EMP3" },
      ]);
      crm.createMany.mockResolvedValue([{ id: 1, employeeId: "EMP1" }]);
      em.findByEmployeeId.mockResolvedValue({ email: "e@x.com", firstName: "A", lastName: "B" });

      const result = await communicationService.create("T", "B", [1, 2], [4], 9, []);

      expect(gs.resolveMemberUserIds).toHaveBeenCalledWith([4]);
      expect(em.findByIds).toHaveBeenCalledWith([1, 2, 3]);
      expect(crm.createMany).toHaveBeenCalledWith(100, ["EMP1", "EMP2", "EMP3"]);
      expect(result).toEqual({ id: 100, title: "T", body: "B" });
      await flush();
    });

    it("creates attachments when files are provided", async () => {
      gs.resolveMemberUserIds.mockResolvedValue([]);
      cm.create.mockResolvedValue({ id: 101 });
      em.findByIds.mockResolvedValue([]);
      crm.createMany.mockResolvedValue([]);

      await communicationService.create("T", "B", [], [], 9, [{ buffer: Buffer.from("x") } as any]);
      expect(am.createMany).toHaveBeenCalledWith("communication", 101, expect.any(Array), 9);
    });
  });

  describe("listAll", () => {
    it("computes acknowledgement/onTime/late aggregates per communication", async () => {
      cm.listAll.mockResolvedValue([
        { id: 1, deadlineAt: "2026-01-10T00:00:00.000Z" },
      ]);
      crm.listByCommunicationId.mockResolvedValue([
        { id: 1, employeeId: "EMP1", respondedAt: "2026-01-05T00:00:00.000Z" }, // on time
        { id: 2, employeeId: "EMP2", respondedAt: "2026-01-15T00:00:00.000Z" }, // late
        { id: 3, employeeId: "EMP3", respondedAt: null }, // pending
      ]);
      em.findByEmployeeIds.mockResolvedValue(
        new Map([
          ["EMP1", { id: 1, firstName: "A", lastName: "One", email: "a@x.com" }],
          ["EMP2", { id: 2, firstName: "B", lastName: "Two", email: "b@x.com" }],
        ]),
      );

      const [result] = await communicationService.listAll();
      expect(result.totalRecipients).toBe(3);
      expect(result.acknowledgedCount).toBe(2);
      expect(result.onTimeCount).toBe(1);
      expect(result.lateCount).toBe(1);
      expect(result.pendingCount).toBe(1);
      expect(result.recipients[2].name).toBe("EMP3"); // falls back to employeeId when no employee match
    });

    it("attaches each communication's own attachments, grouped by entityId (OCD-525)", async () => {
      cm.listAll.mockResolvedValue([{ id: 1 }, { id: 2 }]);
      crm.listByCommunicationId.mockResolvedValue([]);
      em.findByEmployeeIds.mockResolvedValue(new Map());
      am.findByEntityMany.mockResolvedValue([
        { id: 10, entityType: "communication", entityId: 1, fileUrl: "/uploads/others/a.pdf", fileName: "a.pdf", mimeType: "application/pdf", fileSize: 100 },
        { id: 11, entityType: "communication", entityId: 2, fileUrl: "/uploads/others/b.png", fileName: "b.png", mimeType: "image/png", fileSize: 200 },
        { id: 12, entityType: "communication", entityId: 1, fileUrl: "/uploads/others/c.docx", fileName: "c.docx", mimeType: "application/msword", fileSize: 300 },
      ]);

      const [first, second] = await communicationService.listAll();
      expect(am.findByEntityMany).toHaveBeenCalledWith("communication", [1, 2]);
      expect(first.attachments).toEqual([
        { fileUrl: "/uploads/others/a.pdf", fileName: "a.pdf", mimeType: "application/pdf", fileSize: 100 },
        { fileUrl: "/uploads/others/c.docx", fileName: "c.docx", mimeType: "application/msword", fileSize: 300 },
      ]);
      expect(second.attachments).toEqual([
        { fileUrl: "/uploads/others/b.png", fileName: "b.png", mimeType: "image/png", fileSize: 200 },
      ]);
    });

    it("returns an empty attachments array for a communication with none", async () => {
      cm.listAll.mockResolvedValue([{ id: 5 }]);
      crm.listByCommunicationId.mockResolvedValue([]);
      em.findByEmployeeIds.mockResolvedValue(new Map());
      am.findByEntityMany.mockResolvedValue([]);

      const [result] = await communicationService.listAll();
      expect(result.attachments).toEqual([]);
    });
  });

  describe("listMine", () => {
    it("attaches each recipient row's communication attachments, grouped by communicationId (OCD-525)", async () => {
      crm.listForUser.mockResolvedValue([
        { id: 100, communicationId: 1, title: "T1" },
        { id: 101, communicationId: 2, title: "T2" },
      ]);
      am.findByEntityMany.mockResolvedValue([
        { id: 10, entityType: "communication", entityId: 1, fileUrl: "/uploads/others/a.pdf", fileName: "a.pdf", mimeType: "application/pdf", fileSize: 100 },
      ]);

      const [first, second] = await communicationService.listMine("EMP1");
      expect(am.findByEntityMany).toHaveBeenCalledWith("communication", [1, 2]);
      expect(first.attachments).toEqual([
        { fileUrl: "/uploads/others/a.pdf", fileName: "a.pdf", mimeType: "application/pdf", fileSize: 100 },
      ]);
      expect(second.attachments).toEqual([]);
    });
  });

  describe("delete", () => {
    it("throws a 404 AppError when the communication doesn't exist", async () => {
      cm.findById.mockResolvedValue(null);
      await expect(communicationService.delete(1)).rejects.toThrow(AppError);
      await expect(communicationService.delete(1)).rejects.toMatchObject({ statusCode: 404 });
    });

    it("deletes attachments and the communication", async () => {
      cm.findById.mockResolvedValue({ id: 1 });
      await communicationService.delete(1);
      expect(am.deleteByEntity).toHaveBeenCalledWith("communication", 1);
      expect(cm.deleteById).toHaveBeenCalledWith(1);
    });
  });

  describe("respond", () => {
    it("throws a 404 AppError when the caller isn't a recipient", async () => {
      crm.findByCommunicationAndUser.mockResolvedValue(null);
      await expect(communicationService.respond(1, "EMP1")).rejects.toMatchObject({ statusCode: 404 });
    });

    it("throws a 403 AppError when already responded", async () => {
      crm.findByCommunicationAndUser.mockResolvedValue({ id: 1, respondedAt: new Date() });
      await expect(communicationService.respond(1, "EMP1")).rejects.toMatchObject({ statusCode: 403 });
    });

    it("marks the response recorded", async () => {
      crm.findByCommunicationAndUser.mockResolvedValue({ id: 1, respondedAt: null });
      await communicationService.respond(1, "EMP1", "Got it");
      expect(crm.markResponded).toHaveBeenCalledWith(1, "Got it");
    });
  });

  describe("generateReport", () => {
    it("builds an xlsx buffer from the report rows", async () => {
      crm.getReportRows.mockResolvedValue([
        {
          title: "T",
          recipientName: "A",
          recipientLastName: "B",
          recipientEmail: "a@x.com",
          emailSentAt: "2026-01-01T00:00:00.000Z",
          respondedAt: "2026-01-01T02:00:00.000Z",
        },
      ]);
      const buffer = await communicationService.generateReport();
      expect(Buffer.isBuffer(buffer) || buffer instanceof Uint8Array).toBe(true);
    });

    it("formats Email Sent At / Responded At as DD/MM/YYYY, HH:mm:ss in the org timezone, not en-US M/D/YYYY (OCD-572)", async () => {
      // 25th of the month makes a month/day mix-up impossible to miss (there
      // is no month 25) - this would previously have rendered as the en-US
      // default locale's "3/25/2026, ...".
      crm.getReportRows.mockResolvedValue([
        {
          title: "T",
          recipientName: "A",
          recipientLastName: "B",
          recipientEmail: "a@x.com",
          emailSentAt: "2026-03-25T10:15:30.000Z",
          respondedAt: "2026-03-25T12:15:30.000Z",
        },
      ]);
      const buffer = await communicationService.generateReport();

      const ExcelJS = (await import("exceljs")).default;
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer as any);
      const worksheet = workbook.getWorksheet("Communications Report")!;
      const dataRow = worksheet.getRow(2);
      // Column order matches worksheet.columns above: Title(1), Recipient(2),
      // Email Sent At(3), Responded At(4), Response Lead Time(5).
      expect(dataRow.getCell(3).value).toBe("25/03/2026, 15:45:30");
      expect(dataRow.getCell(4).value).toBe("25/03/2026, 17:45:30");
      // Lead time is derived from the raw (correct) timestamps regardless of display format.
      expect(dataRow.getCell(5).value).toBe("2.00 hours");
    });

    it("falls back to 'Not sent' / 'No response' when timestamps are missing", async () => {
      crm.getReportRows.mockResolvedValue([
        { title: "T", recipientName: "A", recipientLastName: "B", recipientEmail: "a@x.com", emailSentAt: null, respondedAt: null },
      ]);
      const buffer = await communicationService.generateReport();

      const ExcelJS = (await import("exceljs")).default;
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer as any);
      const dataRow = workbook.getWorksheet("Communications Report")!.getRow(2);
      expect(dataRow.getCell(3).value).toBe("Not sent");
      expect(dataRow.getCell(4).value).toBe("No response");
      expect(dataRow.getCell(5).value).toBe("-");
    });
  });
});

describe("formatExportTimestamp (OCD-572)", () => {
  it("formats a UTC timestamp as DD/MM/YYYY, HH:mm:ss in the org (Asia/Colombo) timezone", () => {
    expect(formatExportTimestamp("2026-03-25T10:15:30.000Z")).toBe("25/03/2026, 15:45:30");
  });

  it("returns an empty string for null/undefined", () => {
    expect(formatExportTimestamp(null)).toBe("");
    expect(formatExportTimestamp(undefined)).toBe("");
  });
});
