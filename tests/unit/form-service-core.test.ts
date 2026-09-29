import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/modules/forms/Form", () => ({
  FormModel: {
    create: vi.fn(),
    update: vi.fn(),
    listAll: vi.fn(),
    findById: vi.fn(),
    hasAnyQuestion: vi.fn(),
    publish: vi.fn(),
    unpublish: vi.fn(),
    archive: vi.fn(),
    duplicate: vi.fn(),
    deleteById: vi.fn(),
    recordResponse: vi.fn(),
  },
}));
vi.mock("../../src/modules/forms/FormSection", () => ({
  FormSectionModel: { listByFormId: vi.fn(), create: vi.fn(), update: vi.fn(), deleteById: vi.fn(), reorder: vi.fn() },
}));
vi.mock("../../src/modules/forms/FormQuestion", () => ({
  FormQuestionModel: {
    listByFormId: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    deleteById: vi.fn(),
    reorder: vi.fn(),
  },
}));
vi.mock("../../src/modules/forms/FormLogicRule", () => ({
  FormLogicRuleModel: { listByFormId: vi.fn(), create: vi.fn(), update: vi.fn(), deleteById: vi.fn() },
}));
vi.mock("../../src/modules/forms/FormSettings", () => ({
  FormSettingsModel: { findByFormId: vi.fn(), update: vi.fn() },
}));
vi.mock("../../src/modules/forms/FormTheme", () => ({
  FormThemeModel: { findByFormId: vi.fn(), update: vi.fn() },
}));
vi.mock("../../src/modules/forms/FormDistribution", () => ({
  FormDistributionModel: { createMany: vi.fn(), listByUserId: vi.fn(), isDistributedTo: vi.fn() },
}));
vi.mock("../../src/modules/forms/FormResponse", () => ({
  FormResponseModel: {
    listByFormId: vi.fn(),
    listAnswersByResponseId: vi.fn(),
    findByFormAndUser: vi.fn(),
    findOrCreate: vi.fn(),
    replaceAnswers: vi.fn(),
    markSubmitted: vi.fn(),
  },
}));
vi.mock("../../src/common/models/Attachment", () => ({
  AttachmentModel: { deleteByEntity: vi.fn(), create: vi.fn(), findByEntity: vi.fn(), copyToEntity: vi.fn() },
}));
vi.mock("../../src/employees/Employee", () => ({
  EmployeeModel: { findByEmployeeId: vi.fn(), findById: vi.fn(), findByEmployeeIds: vi.fn() },
}));
vi.mock("../../src/modules/groups/group.service", () => ({
  groupService: { resolveMemberUserIds: vi.fn() },
}));
vi.mock("../../src/modules/notifications/notification.service", () => ({
  notificationService: { notifyMany: vi.fn(), notify: vi.fn() },
}));

import { FormModel } from "../../src/modules/forms/Form";
import { FormSectionModel } from "../../src/modules/forms/FormSection";
import { FormSettingsModel } from "../../src/modules/forms/FormSettings";
import { FormDistributionModel } from "../../src/modules/forms/FormDistribution";
import { FormResponseModel } from "../../src/modules/forms/FormResponse";
import { FormQuestionModel } from "../../src/modules/forms/FormQuestion";
import { FormLogicRuleModel } from "../../src/modules/forms/FormLogicRule";
import { AttachmentModel } from "../../src/common/models/Attachment";
import { EmployeeModel } from "../../src/employees/Employee";
import { groupService } from "../../src/modules/groups/group.service";
import { notificationService } from "../../src/modules/notifications/notification.service";
import { formService } from "../../src/modules/forms/form.service";

const fm = FormModel as unknown as Record<string, ReturnType<typeof vi.fn>>;
const fsecm = FormSectionModel as unknown as Record<string, ReturnType<typeof vi.fn>>;
const fsm = FormSettingsModel as unknown as Record<string, ReturnType<typeof vi.fn>>;
const fdm = FormDistributionModel as unknown as Record<string, ReturnType<typeof vi.fn>>;
const frm = FormResponseModel as unknown as Record<string, ReturnType<typeof vi.fn>>;
const fqm = FormQuestionModel as unknown as Record<string, ReturnType<typeof vi.fn>>;
const flrm = FormLogicRuleModel as unknown as Record<string, ReturnType<typeof vi.fn>>;
const am = AttachmentModel as unknown as Record<string, ReturnType<typeof vi.fn>>;
const em = EmployeeModel as unknown as Record<string, ReturnType<typeof vi.fn>>;
const gs = groupService as unknown as Record<string, ReturnType<typeof vi.fn>>;
const ns = notificationService as unknown as Record<string, ReturnType<typeof vi.fn>>;

describe("formService (core)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("create", () => {
    it("creates the form and, when a closeAt is given, updates settings", async () => {
      fm.create.mockResolvedValue({ id: 1, title: "T" });
      await formService.create({ title: "T", closeAt: new Date("2026-08-01") } as any, 9);
      expect(fsm.update).toHaveBeenCalledWith(1, { closeAt: new Date("2026-08-01") });
    });

    it("skips settings update when no closeAt is given", async () => {
      fm.create.mockResolvedValue({ id: 2, title: "T" });
      await formService.create({ title: "T" } as any, 9);
      expect(fsm.update).not.toHaveBeenCalled();
    });
  });

  describe("publish", () => {
    it("throws a 400 AppError when the form has no questions", async () => {
      fm.hasAnyQuestion.mockResolvedValue(false);
      await expect(formService.publish(1)).rejects.toMatchObject({ statusCode: 400 });
    });

    it("throws a 404 AppError when publish returns nothing", async () => {
      fm.hasAnyQuestion.mockResolvedValue(true);
      fm.publish.mockResolvedValue(null);
      await expect(formService.publish(1)).rejects.toMatchObject({ statusCode: 404 });
    });

    it("publishes when a question exists", async () => {
      fm.hasAnyQuestion.mockResolvedValue(true);
      fm.publish.mockResolvedValue({ id: 1, status: "published" });
      const result = await formService.publish(1);
      expect(result.status).toBe("published");
    });
  });

  describe("list (status derivation)", () => {
    it("derives 'closed' when a published form has acceptResponses=false", async () => {
      fm.listAll.mockResolvedValue([{ id: 1, status: "published" }]);
      fsm.findByFormId.mockResolvedValue({ acceptResponses: false, closeAt: null });
      const [result] = await formService.list();
      expect(result.status).toBe("closed");
    });

    it("derives 'closed' when the deadline has passed", async () => {
      fm.listAll.mockResolvedValue([{ id: 1, status: "published" }]);
      fsm.findByFormId.mockResolvedValue({ acceptResponses: true, closeAt: new Date("2000-01-01") });
      const [result] = await formService.list();
      expect(result.status).toBe("closed");
    });

    it("keeps the raw status when still accepting responses before the deadline", async () => {
      fm.listAll.mockResolvedValue([{ id: 1, status: "published" }]);
      fsm.findByFormId.mockResolvedValue({ acceptResponses: true, closeAt: new Date("2999-01-01") });
      const [result] = await formService.list();
      expect(result.status).toBe("published");
    });

    it("leaves draft/archived forms alone regardless of settings", async () => {
      fm.listAll.mockResolvedValue([{ id: 1, status: "draft" }]);
      fsm.findByFormId.mockResolvedValue({ acceptResponses: false, closeAt: null });
      const [result] = await formService.list();
      expect(result.status).toBe("draft");
    });
  });

  describe("distribute", () => {
    it("throws a 404 AppError for a missing form", async () => {
      fm.findById.mockResolvedValue(null);
      await expect(formService.distribute(1, [1], [])).rejects.toMatchObject({ statusCode: 404 });
    });

    it("merges direct userIds with resolved group members and notifies only new distributions", async () => {
      fm.findById.mockResolvedValue({ id: 1, title: "Survey" });
      gs.resolveMemberUserIds.mockResolvedValue([2, 3]);
      fdm.createMany.mockResolvedValue([{ employeeId: "EMP2" }]);
      await formService.distribute(1, [1, 2], [10]);
      expect(gs.resolveMemberUserIds).toHaveBeenCalledWith([10]);
      expect(fdm.createMany).toHaveBeenCalledWith(1, [1, 2, 3]);
      expect(ns.notifyMany).toHaveBeenCalledWith(
        ["EMP2"],
        "form",
        expect.stringContaining("Survey"),
        expect.any(String),
        { formId: 1 },
        "/my-forms",
      );
    });

    it("updates settings.closeAt only when explicitly provided", async () => {
      fm.findById.mockResolvedValue({ id: 1, title: "Survey" });
      gs.resolveMemberUserIds.mockResolvedValue([]);
      fdm.createMany.mockResolvedValue([]);
      await formService.distribute(1, [1], [], null);
      expect(fsm.update).toHaveBeenCalledWith(1, { closeAt: null });
    });
  });

  describe("submitResponse", () => {
    const question = (overrides: any = {}) => ({
      id: 1,
      type: "short_answer",
      required: true,
      title: "Q1",
      options: [],
      config: null,
      ...overrides,
    });

    beforeEach(() => {
      fdm.isDistributedTo.mockResolvedValue(true);
      fsm.findByFormId.mockResolvedValue({ acceptResponses: true, allowEditAfterSubmit: false });
      frm.findByFormAndUser.mockResolvedValue(null);
      flrm.listByFormId.mockResolvedValue([]);
      frm.findOrCreate.mockResolvedValue({ id: 100, startedAt: new Date("2026-01-01T00:00:00Z") });
      frm.listAnswersByResponseId.mockResolvedValue([]);
      frm.replaceAnswers.mockResolvedValue([{ questionId: 1, id: 1 }]);
    });

    it("forbids submitting to a form that wasn't distributed to the user", async () => {
      fdm.isDistributedTo.mockResolvedValue(false);
      await expect(formService.submitResponse(1, 9, [], [], true)).rejects.toMatchObject({ statusCode: 403 });
    });

    it("blocks submission when the form has stopped accepting responses", async () => {
      fsm.findByFormId.mockResolvedValue({ acceptResponses: false });
      await expect(formService.submitResponse(1, 9, [], [], true)).rejects.toMatchObject({ statusCode: 400 });
    });

    it("blocks a second final submission unless edits are allowed", async () => {
      frm.findByFormAndUser.mockResolvedValue({ status: "submitted" });
      fqm.listByFormId.mockResolvedValue([]);
      await expect(formService.submitResponse(1, 9, [], [], true)).rejects.toMatchObject({ statusCode: 400 });
    });

    it("requires a required, visible question to be answered on final submission", async () => {
      fqm.listByFormId.mockResolvedValue([question()]);
      await expect(
        formService.submitResponse(1, 9, [{ questionId: 2, value: "irrelevant" }], [], true),
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("skips required validation for a question hidden by logic rules", async () => {
      fqm.listByFormId.mockResolvedValue([question({ id: 2 })]);
      flrm.listByFormId.mockResolvedValue([
        { targetQuestionId: 2, sourceQuestionId: 1, comparator: "equals", comparisonValue: "yes", action: "show", combinator: "all" },
      ]);
      const result = await formService.submitResponse(1, 9, [{ questionId: 1, value: "no" }], [], true);
      expect(result.response.status).toBe("submitted");
    });

    it("rejects an invalid multiple_choice value not in the question's options", async () => {
      fqm.listByFormId.mockResolvedValue([
        question({ id: 3, type: "multiple_choice", required: false, options: [{ value: "a" }, { value: "b" }] }),
      ]);
      await expect(
        formService.submitResponse(1, 9, [{ questionId: 3, value: "z" }], [], true),
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("allows an 'other' value for multiple_choice when config.allowOther is set", async () => {
      fqm.listByFormId.mockResolvedValue([
        question({
          id: 3,
          type: "multiple_choice",
          required: false,
          options: [{ value: "a" }],
          config: { allowOther: true },
        }),
      ]);
      const result = await formService.submitResponse(1, 9, [{ questionId: 3, value: "custom" }], [], true);
      expect(result.response.status).toBe("submitted");
    });

    it("saves a draft (final=false) without enforcing required-question validation", async () => {
      fqm.listByFormId.mockResolvedValue([question()]);
      const result = await formService.submitResponse(1, 9, [], [], false);
      expect(frm.markSubmitted).not.toHaveBeenCalled();
      expect(result.answers).toBeDefined();
    });

    it("enforces file size limits for file_upload questions", async () => {
      fqm.listByFormId.mockResolvedValue([
        question({ id: 4, type: "file_upload", required: false, config: { maxSizeMb: 1 } }),
      ]);
      const file = { fieldname: "question_4", size: 2 * 1024 * 1024, originalname: "big.pdf" } as any;
      await expect(formService.submitResponse(1, 9, [], [file], true)).rejects.toMatchObject({ statusCode: 400 });
    });

    it("enforces allowed file extensions for file_upload questions", async () => {
      fqm.listByFormId.mockResolvedValue([
        question({ id: 4, type: "file_upload", required: false, config: { allowedMimeTypes: ["pdf"] } }),
      ]);
      const file = { fieldname: "question_4", size: 1024, originalname: "doc.exe" } as any;
      await expect(formService.submitResponse(1, 9, [], [file], true)).rejects.toMatchObject({ statusCode: 400 });
    });

    it("marks the response submitted and records the form response count on final submit", async () => {
      fqm.listByFormId.mockResolvedValue([question({ required: false })]);
      const result = await formService.submitResponse(1, 9, [{ questionId: 1, value: "hello" }], [], true);
      expect(frm.markSubmitted).toHaveBeenCalledWith(100, expect.any(Number));
      expect(fm.recordResponse).toHaveBeenCalledWith(1);
      expect(result.response.status).toBe("submitted");
    });

    it("does not double-count recordResponse when re-submitting an already-submitted response with edits allowed", async () => {
      fsm.findByFormId.mockResolvedValue({ acceptResponses: true, allowEditAfterSubmit: true });
      frm.findByFormAndUser.mockResolvedValue({ status: "submitted", startedAt: new Date() });
      fqm.listByFormId.mockResolvedValue([question({ required: false })]);
      await formService.submitResponse(1, 9, [{ questionId: 1, value: "hello" }], [], true);
      expect(fm.recordResponse).not.toHaveBeenCalled();
    });

    it("rejects a number answer outside the question's configured min/max", async () => {
      fqm.listByFormId.mockResolvedValue([
        question({ id: 5, type: "number", required: false, config: { min: 18, max: 24 } }),
      ]);
      await expect(
        formService.submitResponse(1, 9, [{ questionId: 5, value: 1234 }], [], true),
      ).rejects.toMatchObject({ statusCode: 400 });
      await expect(
        formService.submitResponse(1, 9, [{ questionId: 5, value: -20 }], [], true),
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("accepts a number answer within the configured min/max", async () => {
      fqm.listByFormId.mockResolvedValue([
        question({ id: 5, type: "number", required: false, config: { min: 18, max: 24 } }),
      ]);
      const result = await formService.submitResponse(1, 9, [{ questionId: 5, value: 20 }], [], true);
      expect(result.response.status).toBe("submitted");
    });

    it("rejects a checkboxes answer outside the configured min/max selections", async () => {
      fqm.listByFormId.mockResolvedValue([
        question({
          id: 6,
          type: "checkboxes",
          required: false,
          options: [{ value: "a" }, { value: "b" }, { value: "c" }, { value: "d" }],
          config: { minSelections: 2, maxSelections: 4 },
        }),
      ]);
      await expect(
        formService.submitResponse(1, 9, [{ questionId: 6, value: ["a"] }], [], true),
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("rejects a short_answer value longer than the configured maxLength", async () => {
      fqm.listByFormId.mockResolvedValue([
        question({ id: 7, type: "short_answer", required: false, config: { maxLength: 5 } }),
      ]);
      await expect(
        formService.submitResponse(1, 9, [{ questionId: 7, value: "way too long" }], [], true),
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("rejects more files than the question's configured maxFiles", async () => {
      fqm.listByFormId.mockResolvedValue([
        question({ id: 4, type: "file_upload", required: false, config: { maxFiles: 1 } }),
      ]);
      const files = [
        { fieldname: "question_4", size: 10, originalname: "a.pdf" },
        { fieldname: "question_4", size: 10, originalname: "b.pdf" },
      ] as any;
      await expect(formService.submitResponse(1, 9, [], files, true)).rejects.toMatchObject({ statusCode: 400 });
    });

    it("stores grid answers as readable text rather than raw JSON", async () => {
      fqm.listByFormId.mockResolvedValue([
        question({ id: 8, type: "multiple_choice_grid", required: false, options: [{ value: "row1", label: "Row 1" }] }),
      ]);
      await formService.submitResponse(1, 9, [{ questionId: 8, value: { row1: "Col A" } }], [], true);
      expect(frm.replaceAnswers).toHaveBeenCalledWith(
        100,
        expect.arrayContaining([expect.objectContaining({ questionId: 8, valueText: "row1: Col A" })]),
      );
    });

    it("notifies the respondent on final submit when notifyRespondent is enabled", async () => {
      fsm.findByFormId.mockResolvedValue({ acceptResponses: true, allowEditAfterSubmit: false, notifyRespondent: true });
      fqm.listByFormId.mockResolvedValue([question({ required: false })]);
      fm.findById.mockResolvedValue({ id: 1, title: "Feedback", createdBy: 5 });
      em.findById.mockResolvedValue({ employeeId: "EMP9", firstName: "Jane", lastName: "Doe" });
      await formService.submitResponse(1, 9, [{ questionId: 1, value: "hello" }], [], true);
      expect(ns.notify).toHaveBeenCalledWith(
        "EMP9",
        "form",
        expect.any(String),
        expect.any(String),
        { formId: 1 },
        "/my-forms",
      );
    });

    it("notifies the form owner on final submit when notifyOwnerOnResponse is enabled and the owner isn't the submitter", async () => {
      fsm.findByFormId.mockResolvedValue({ acceptResponses: true, allowEditAfterSubmit: false, notifyOwnerOnResponse: true });
      fqm.listByFormId.mockResolvedValue([question({ required: false })]);
      fm.findById.mockResolvedValue({ id: 1, title: "Feedback", createdBy: 5 });
      em.findById.mockImplementation((id: number) =>
        id === 9
          ? Promise.resolve({ employeeId: "EMP9", firstName: "Jane", lastName: "Doe" })
          : Promise.resolve({ employeeId: "EMP5", firstName: "Owner", lastName: "Person" }),
      );
      await formService.submitResponse(1, 9, [{ questionId: 1, value: "hello" }], [], true);
      expect(ns.notify).toHaveBeenCalledWith(
        "EMP5",
        "form",
        expect.stringContaining("Feedback"),
        expect.any(String),
        { formId: 1 },
        "/admin/forms/1/responses",
      );
    });
  });

  describe("exportResponses", () => {
    it("marks late submissions distinctly from on-time ones in the Status column (CSV)", async () => {
      fm.findById.mockResolvedValue({ id: 1, title: "Feedback", status: "published" });
      fsecm.listByFormId.mockResolvedValue([]);
      fqm.listByFormId.mockResolvedValue([
        { id: 1, type: "short_answer", title: "Q1", orderIndex: 0 },
      ]);
      flrm.listByFormId.mockResolvedValue([]);
      const closeAt = new Date("2026-09-24T04:00:00.000Z"); // 09:30 in Asia/Colombo (UTC+5:30)
      fsm.findByFormId.mockResolvedValue({ closeAt });

      frm.listByFormId.mockResolvedValue([
        {
          id: 10,
          employeeId: "EMP1",
          status: "submitted",
          submittedAt: new Date("2026-09-24T10:00:00.000Z"), // after the deadline -> late
        },
        {
          id: 11,
          employeeId: "EMP2",
          status: "submitted",
          submittedAt: new Date("2026-09-24T02:00:00.000Z"), // before the deadline -> on time
        },
      ]);
      frm.listAnswersByResponseId.mockResolvedValue([]);
      em.findByEmployeeId.mockImplementation((employeeId: string) =>
        Promise.resolve({ firstName: "A", lastName: employeeId, email: `${employeeId}@x.com` }),
      );

      const buffer = await formService.exportResponses(1, "csv");
      const csv = buffer.toString("utf-8");
      const lines = csv.split("\n");
      expect(lines[1]).toContain("Submitted (Late)");
      expect(lines[2]).toContain("Submitted");
      expect(lines[2]).not.toContain("(Late)");
      // DD/MM/YYYY, HH:mm:ss in the org's operating timezone, matching what the Responses page displays.
      expect(lines[1]).toContain("24/09/2026, 15:30:00");
    });
  });

  describe("delete", () => {
    it("throws a 404 AppError when the form doesn't exist", async () => {
      fm.findById.mockResolvedValue(null);
      await expect(formService.delete(1)).rejects.toMatchObject({ statusCode: 404 });
    });

    it("cleans up response answer attachments before deleting the form", async () => {
      fm.findById.mockResolvedValue({ id: 1 });
      frm.listByFormId.mockResolvedValue([{ id: 50 }]);
      frm.listAnswersByResponseId.mockResolvedValue([{ id: 500 }]);
      await formService.delete(1);
      expect(am.deleteByEntity).toHaveBeenCalledWith("form_response_answer", 500);
      expect(fm.deleteById).toHaveBeenCalledWith(1);
    });
  });
});
