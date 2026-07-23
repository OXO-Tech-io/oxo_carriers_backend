import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { EmployeeModel } from "../../src/models/Employee";
import { FormModel } from "../../src/models/Form";
import { formService } from "../../src/services/form.service";
import { isQuestionVisible } from "../../src/utils/formLogic";
import { parseQuestionConfig } from "../../src/validators/formQuestionConfig.validator";
import { UserRole } from "../../src/types";

describe("formQuestionConfig.validator - parseQuestionConfig", () => {
  it("fills in defaults for a scale question and rejects an invalid range", () => {
    expect(parseQuestionConfig("linear_scale", {})).toEqual({ min: 1, max: 5 });
    expect(() => parseQuestionConfig("linear_scale", { min: 5, max: 1 })).toThrow();
  });

  it("strips unknown keys and keeps a text question's maxLength", () => {
    const config = parseQuestionConfig("short_answer", { maxLength: 100, bogus: "nope" });
    expect(config).toEqual({ maxLength: 100 });
  });

  it("requires at least one column for grid questions", () => {
    expect(() => parseQuestionConfig("multiple_choice_grid", {})).toThrow();
    expect(parseQuestionConfig("multiple_choice_grid", { columns: ["A", "B"] })).toEqual({ columns: ["A", "B"] });
  });
});

describe("formLogic - isQuestionVisible", () => {
  const rule = (overrides: Partial<Parameters<typeof isQuestionVisible>[1][number]> = {}) => ({
    targetQuestionId: 2,
    sourceQuestionId: 1,
    comparator: "equals" as const,
    comparisonValue: "yes",
    action: "show" as const,
    combinator: "all" as const,
    ...overrides,
  });

  it("is visible by default when no rule targets the question", () => {
    expect(isQuestionVisible(99, [], {})).toBe(true);
  });

  it("shows the target only when a 'show' rule matches", () => {
    const rules = [rule()];
    expect(isQuestionVisible(2, rules, { 1: "yes" })).toBe(true);
    expect(isQuestionVisible(2, rules, { 1: "no" })).toBe(false);
  });

  it("inverts the match for a 'hide' rule", () => {
    const rules = [rule({ action: "hide" })];
    expect(isQuestionVisible(2, rules, { 1: "yes" })).toBe(false);
    expect(isQuestionVisible(2, rules, { 1: "no" })).toBe(true);
  });

  it("requires every rule for 'all' but only one for 'any'", () => {
    const rules = [
      rule({ sourceQuestionId: 1, comparisonValue: "yes", combinator: "all" }),
      rule({ sourceQuestionId: 3, comparisonValue: "x", combinator: "all" }),
    ];
    expect(isQuestionVisible(2, rules, { 1: "yes", 3: "x" })).toBe(true);
    expect(isQuestionVisible(2, rules, { 1: "yes", 3: "other" })).toBe(false);

    const anyRules = rules.map((r) => ({ ...r, combinator: "any" as const }));
    expect(isQuestionVisible(2, anyRules, { 1: "yes", 3: "other" })).toBe(true);
  });
});

describe("formService (integration)", () => {
  let owner: any = null;
  let respondent1: any = null;
  let respondent2: any = null;
  const ownerEmployeeId = "TEST_FORM_OWNER_999";
  const respondent1EmployeeId = "TEST_FORM_RESP1_999";
  const respondent2EmployeeId = "TEST_FORM_RESP2_999";
  const createdFormIds: number[] = [];

  beforeAll(async () => {
    for (const empId of [ownerEmployeeId, respondent1EmployeeId, respondent2EmployeeId]) {
      const existing = await EmployeeModel.findByEmployeeId(empId);
      if (existing) await EmployeeModel.delete(existing.id);
    }
    owner = await EmployeeModel.create({
      employee_id: ownerEmployeeId,
      email: "test_form_owner@example.com",
      first_name: "Owner",
      last_name: "Test",
      role: UserRole.HR_MANAGER,
    });
    respondent1 = await EmployeeModel.create({
      employee_id: respondent1EmployeeId,
      email: "test_form_resp1@example.com",
      first_name: "Resp",
      last_name: "One",
      role: UserRole.EMPLOYEE,
    });
    respondent2 = await EmployeeModel.create({
      employee_id: respondent2EmployeeId,
      email: "test_form_resp2@example.com",
      first_name: "Resp",
      last_name: "Two",
      role: UserRole.EMPLOYEE,
    });
  });

  afterAll(async () => {
    for (const id of createdFormIds) await FormModel.delete(id).catch(() => undefined);
    for (const emp of [owner, respondent1, respondent2]) {
      if (emp) await EmployeeModel.delete(emp.id).catch(() => undefined);
    }
  });

  it("creates a form, blocks publish with no questions, then publishes once one exists", async () => {
    const form = await formService.create({ title: "Test Form A" }, owner.id);
    createdFormIds.push(form.id);
    expect(form.status).toBe("draft");

    await expect(formService.publish(form.id)).rejects.toThrow(/at least one question/i);

    await formService.createQuestion(form.id, {
      sectionId: null,
      type: "short_answer",
      title: "Name",
      required: true,
      config: {},
      options: [],
    } as any);

    const published = await formService.publish(form.id);
    expect(published.status).toBe("published");
    expect(published.publishedAt).toBeTruthy();
  });

  it("supports section CRUD + reorder", async () => {
    const form = await formService.create({ title: "Test Form B" }, owner.id);
    createdFormIds.push(form.id);

    const s1 = await formService.createSection(form.id, { title: "Section 1" } as any);
    const s2 = await formService.createSection(form.id, { title: "Section 2" } as any);
    expect(s1.orderIndex).toBe(0);
    expect(s2.orderIndex).toBe(1);

    await formService.reorderSections(form.id, [s2.id, s1.id]);
    const graph = await formService.getFormGraph(form.id);
    const sorted = [...graph.sections].sort((a, b) => a.orderIndex - b.orderIndex);
    expect(sorted.map((s) => s.id)).toEqual([s2.id, s1.id]);

    const renamed = await formService.updateSection(s1.id, { title: "Renamed" } as any);
    expect(renamed.title).toBe("Renamed");

    await formService.deleteSection(s2.id);
    const afterDelete = await formService.getFormGraph(form.id);
    expect(afterDelete.sections.map((s) => s.id)).toEqual([s1.id]);
  });

  it("supports question CRUD, option diffing, and reorder", async () => {
    const form = await formService.create({ title: "Test Form C" }, owner.id);
    createdFormIds.push(form.id);

    const q1 = await formService.createQuestion(form.id, {
      type: "multiple_choice",
      title: "Pick one",
      required: false,
      config: {},
      options: [{ label: "Red" }, { label: "Blue" }],
    } as any);
    expect(q1.options).toHaveLength(2);
    expect(q1.options[0].value).toBe("Red"); // value defaults to label when omitted

    const q2 = await formService.createQuestion(form.id, {
      type: "short_answer",
      title: "Second",
      required: false,
      config: {},
      options: [],
    } as any);
    expect(q2.orderIndex).toBe(1);

    // Update q1: drop "Blue", keep "Red" (by id), add "Green".
    const keepOption = q1.options.find((o: any) => o.label === "Red");
    const updated = await formService.updateQuestion(q1.id, {
      options: [
        { id: keepOption.id, label: "Red" },
        { label: "Green" },
      ],
    } as any);
    expect(updated.options.map((o: any) => o.label).sort()).toEqual(["Green", "Red"]);

    await formService.reorderQuestions(form.id, [q2.id, q1.id]);
    const graph = await formService.getFormGraph(form.id);
    const sorted = [...graph.questions].sort((a, b) => a.orderIndex - b.orderIndex);
    expect(sorted.map((q) => q.id)).toEqual([q2.id, q1.id]);

    await formService.deleteQuestion(q2.id);
    const afterDelete = await formService.getFormGraph(form.id);
    expect(afterDelete.questions.map((q) => q.id)).toEqual([q1.id]);
  });

  it("supports logic rule CRUD", async () => {
    const form = await formService.create({ title: "Test Form D" }, owner.id);
    createdFormIds.push(form.id);
    const a = await formService.createQuestion(form.id, { type: "yes_no", title: "A", options: [] } as any);
    const b = await formService.createQuestion(form.id, { type: "short_answer", title: "B", options: [] } as any);

    const rule = await formService.createLogicRule(form.id, {
      targetQuestionId: b.id,
      sourceQuestionId: a.id,
      comparator: "equals",
      comparisonValue: "yes",
      action: "show",
      combinator: "all",
    } as any);
    expect(rule.targetQuestionId).toBe(b.id);

    const updatedRule = await formService.updateLogicRule(rule.id, { comparator: "not_equals" } as any);
    expect(updatedRule.comparator).toBe("not_equals");

    await formService.deleteLogicRule(rule.id);
    const graph = await formService.getFormGraph(form.id);
    expect(graph.logicRules).toHaveLength(0);
  });

  it("validates required/config/logic-visibility at final submit and aggregates analytics", async () => {
    const form = await formService.create({ title: "Test Form E" }, owner.id);
    createdFormIds.push(form.id);

    const a = await formService.createQuestion(form.id, { type: "yes_no", title: "Attending?", required: true, options: [] } as any);
    const b = await formService.createQuestion(form.id, {
      type: "short_answer",
      title: "Dietary requirements",
      required: true,
      options: [],
    } as any);
    await formService.createLogicRule(form.id, {
      targetQuestionId: b.id,
      sourceQuestionId: a.id,
      comparator: "equals",
      comparisonValue: "yes",
      action: "show",
      combinator: "all",
    } as any);
    await formService.publish(form.id);
    await formService.distribute(form.id, [respondent1.id, respondent2.id], []);

    // Draft autosave with no answers must not trigger required validation.
    const draft = await formService.submitResponse(form.id, respondent1.id, [], [], false);
    expect(draft.response.status).toBe("in_progress");

    // Respondent 1 answers "no" - B stays hidden, so it's fine that it's missing.
    const r1 = await formService.submitResponse(form.id, respondent1.id, [{ questionId: a.id, value: "no" }], [], true);
    expect(r1.response.status).toBe("submitted");
    expect(r1.isFirstSubmission).toBe(true);

    // Respondent 2 answers "yes" but omits the now-required-and-visible B - must be rejected.
    await expect(
      formService.submitResponse(form.id, respondent2.id, [{ questionId: a.id, value: "yes" }], [], true)
    ).rejects.toThrow(/required/i);

    // Respondent 2 completes B - now succeeds.
    const r2 = await formService.submitResponse(
      form.id,
      respondent2.id,
      [
        { questionId: a.id, value: "yes" },
        { questionId: b.id, value: "Vegetarian" },
      ],
      [],
      true
    );
    expect(r2.response.status).toBe("submitted");

    const analytics = await formService.getAnalytics(form.id);
    expect(analytics.totalResponses).toBe(2);
    expect(analytics.totalStarted).toBe(2);
    expect(analytics.completionRate).toBe(1);

    const aStats = analytics.perQuestion.find((q: any) => q.questionId === a.id);
    expect(aStats?.distribution).toEqual(expect.arrayContaining([
      { label: "no", count: 1 },
      { label: "yes", count: 1 },
    ]));

    const bStats = analytics.perQuestion.find((q: any) => q.questionId === b.id);
    expect(bStats?.responseCount).toBe(1); // only respondent 2 answered B
  });

  it("rejects an out-of-range answer against the question's config", async () => {
    const form = await formService.create({ title: "Test Form F" }, owner.id);
    createdFormIds.push(form.id);
    const scale = await formService.createQuestion(form.id, {
      type: "linear_scale",
      title: "Rate us",
      required: true,
      config: { min: 1, max: 5 },
      options: [],
    } as any);
    await formService.publish(form.id);
    await formService.distribute(form.id, [respondent1.id], []);

    await expect(
      formService.submitResponse(form.id, respondent1.id, [{ questionId: scale.id, value: 42 }], [], true)
    ).rejects.toThrow(/between 1 and 5/i);
  });
});
