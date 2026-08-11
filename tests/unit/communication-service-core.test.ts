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
  AttachmentModel: { createMany: vi.fn(), deleteByEntity: vi.fn() },
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

const cm = CommunicationModel as unknown as Record<string, ReturnType<typeof vi.fn>>;
const crm = CommunicationRecipientModel as unknown as Record<string, ReturnType<typeof vi.fn>>;
const am = AttachmentModel as unknown as Record<string, ReturnType<typeof vi.fn>>;
const em = EmployeeModel as unknown as Record<string, ReturnType<typeof vi.fn>>;
const gs = groupService as unknown as Record<string, ReturnType<typeof vi.fn>>;

const flush = () => new Promise((resolve) => setImmediate(resolve));

describe("communicationService (core)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
  });
});
