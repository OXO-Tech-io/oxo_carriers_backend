import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/modules/forms/form.service", () => ({
  formService: {
    create: vi.fn(),
    update: vi.fn(),
    list: vi.fn(),
    getFormWithGraph: vi.fn(),
    delete: vi.fn(),
    duplicate: vi.fn(),
    publish: vi.fn(),
    unpublish: vi.fn(),
    archive: vi.fn(),
    distribute: vi.fn(),
    createSection: vi.fn(),
    updateSection: vi.fn(),
    deleteSection: vi.fn(),
    reorderSections: vi.fn(),
    createQuestion: vi.fn(),
    updateQuestion: vi.fn(),
    deleteQuestion: vi.fn(),
    reorderQuestions: vi.fn(),
    createLogicRule: vi.fn(),
    updateLogicRule: vi.fn(),
    deleteLogicRule: vi.fn(),
    getSettings: vi.fn(),
    updateSettings: vi.fn(),
    getTheme: vi.fn(),
    updateTheme: vi.fn(),
    getAnalytics: vi.fn(),
    listAssignedToMe: vi.fn(),
    getMyResponse: vi.fn(),
    submitResponse: vi.fn(),
    listResponses: vi.fn(),
    exportResponses: vi.fn(),
  },
}));

import { formService } from "../../src/modules/forms/form.service";
import { FormsService } from "../../src/modules/forms/forms.service";

const fs = formService as unknown as Record<string, ReturnType<typeof vi.fn>>;

describe("FormsService (thin wrapper)", () => {
  const service = new FormsService();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("create parses the body with zod and delegates", async () => {
    fs.create.mockResolvedValue({ id: 1 });
    await service.create({ title: "Survey" }, 9);
    expect(fs.create).toHaveBeenCalledWith(expect.objectContaining({ title: "Survey" }), 9);
  });

  it("create rejects an invalid body (missing title)", async () => {
    await expect(service.create({}, 9)).rejects.toThrow();
  });

  it("createSection validates and delegates", async () => {
    await service.createSection(1, { title: "Section A" });
    expect(fs.createSection).toHaveBeenCalledWith(1, expect.objectContaining({ title: "Section A" }));
  });

  it("createQuestion validates and delegates, rejecting a bad payload", async () => {
    await service.createQuestion(1, { type: "short_answer" });
    expect(fs.createQuestion).toHaveBeenCalledWith(1, expect.objectContaining({ type: "short_answer" }));
    await expect(service.createQuestion(1, { type: "not_a_type" })).rejects.toThrow();
  });

  it("reorderQuestions unwraps questionIds", async () => {
    await service.reorderQuestions({ questionIds: ["1", "2"] });
    expect(fs.reorderQuestions).toHaveBeenCalledWith([1, 2]);
  });

  it("createLogicRule validates and delegates", async () => {
    await service.createLogicRule(1, { targetQuestionId: 2, sourceQuestionId: 1, comparator: "equals" });
    expect(fs.createLogicRule).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ targetQuestionId: 2, sourceQuestionId: 1 }),
    );
  });

  it("distribute unwraps userIds/groupIds/closeAt", async () => {
    await service.distribute(1, { userIds: [1] });
    expect(fs.distribute).toHaveBeenCalledWith(1, [1], [], null);
  });

  it("updateSettings validates and delegates", async () => {
    await service.updateSettings(1, { acceptResponses: false });
    expect(fs.updateSettings).toHaveBeenCalledWith(1, expect.objectContaining({ acceptResponses: false }));
  });

  it("updateTheme validates and forwards an optional file", async () => {
    const file = { filename: "logo.png" } as any;
    await service.updateTheme(1, { primaryColor: "#fff" }, file);
    expect(fs.updateTheme).toHaveBeenCalledWith(1, expect.objectContaining({ primaryColor: "#fff" }), file);
  });

  it("submitResponse unwraps answers/final and forwards files", async () => {
    const files = [{ fieldname: "question_1" } as any];
    await service.submitResponse(1, 9, { answers: [{ questionId: 1, value: "x" }] }, files);
    expect(fs.submitResponse).toHaveBeenCalledWith(
      1,
      9,
      [{ questionId: 1, value: "x" }],
      files,
      true,
    );
  });

  it("simple passthroughs delegate 1:1 (list/getFormWithGraph/delete/duplicate/publish/unpublish/archive)", async () => {
    fs.list.mockResolvedValue([]);
    fs.getFormWithGraph.mockResolvedValue({});
    fs.delete.mockResolvedValue(undefined);
    fs.duplicate.mockResolvedValue({});
    fs.publish.mockResolvedValue({});
    fs.unpublish.mockResolvedValue({});
    fs.archive.mockResolvedValue({});
    fs.getSettings.mockResolvedValue({});
    fs.getTheme.mockResolvedValue({});
    fs.getAnalytics.mockResolvedValue({});
    fs.listAssignedToMe.mockResolvedValue([]);
    fs.getMyResponse.mockResolvedValue({});
    fs.listResponses.mockResolvedValue([]);
    fs.exportResponses.mockResolvedValue(Buffer.from(""));

    await service.list();
    await service.getFormWithGraph(1);
    await service.delete(1);
    await service.duplicate(1, 9);
    await service.publish(1);
    await service.unpublish(1);
    await service.archive(1);
    await service.getSettings(1);
    await service.getTheme(1);
    await service.getAnalytics(1);
    await service.listAssignedToMe(9);
    await service.getMyResponse(1, 9);
    await service.listResponses(1);
    await service.exportResponses(1, "csv");

    expect(fs.getFormWithGraph).toHaveBeenCalledWith(1);
    expect(fs.duplicate).toHaveBeenCalledWith(1, 9);
    expect(fs.exportResponses).toHaveBeenCalledWith(1, "csv");
  });
});
