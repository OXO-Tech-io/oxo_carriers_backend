import { describe, it, expect } from "vitest";
import {
  createFormSchema,
  createQuestionSchema,
  distributeFormSchema,
  submitFormResponseSchema,
  reorderSectionsSchema,
  formIdParamSchema,
} from "../../src/validators/form.validator";

describe("form.validator", () => {
  describe("createFormSchema", () => {
    it("accepts a minimal payload", () => {
      expect(createFormSchema.safeParse({ title: "Feedback" }).success).toBe(true);
    });

    it("converts a string closeAt to a Date and null stays null", () => {
      const withDate = createFormSchema.safeParse({ title: "F", closeAt: "2026-08-01" });
      expect(withDate.success).toBe(true);
      if (withDate.success) expect(withDate.data.closeAt).toBeInstanceOf(Date);

      const withNull = createFormSchema.safeParse({ title: "F", closeAt: null });
      expect(withNull.success).toBe(true);
      if (withNull.success) expect(withNull.data.closeAt).toBeNull();
    });

    it("rejects an empty title", () => {
      expect(createFormSchema.safeParse({ title: "" }).success).toBe(false);
    });
  });

  describe("createQuestionSchema", () => {
    it("accepts a short_answer question without options", () => {
      const result = createQuestionSchema.safeParse({ type: "short_answer" });
      expect(result.success).toBe(true);
    });

    it("requires at least one option for multiple_choice questions", () => {
      const result = createQuestionSchema.safeParse({ type: "multiple_choice" });
      expect(result.success).toBe(false);
    });

    it("accepts a multiple_choice question with options", () => {
      const result = createQuestionSchema.safeParse({
        type: "multiple_choice",
        options: [{ label: "Yes", value: "yes" }],
      });
      expect(result.success).toBe(true);
    });

    it("rejects an unknown question type", () => {
      expect(createQuestionSchema.safeParse({ type: "not_a_type" }).success).toBe(false);
    });
  });

  describe("distributeFormSchema", () => {
    it("requires at least one user or group", () => {
      expect(distributeFormSchema.safeParse({}).success).toBe(false);
    });

    it("accepts with only userIds", () => {
      const result = distributeFormSchema.safeParse({ userIds: [1] });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.groupIds).toEqual([]);
    });
  });

  describe("submitFormResponseSchema", () => {
    it("parses a JSON-string answers array (multipart)", () => {
      const result = submitFormResponseSchema.safeParse({
        answers: JSON.stringify([{ questionId: 1, value: "hi" }]),
      });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.answers).toHaveLength(1);
    });

    it("defaults final to true when omitted", () => {
      const result = submitFormResponseSchema.safeParse({ answers: [] });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.final).toBe(true);
    });

    it("accepts final=false as a string for draft autosave", () => {
      const result = submitFormResponseSchema.safeParse({ answers: [], final: "false" });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.final).toBe(false);
    });
  });

  describe("misc schemas", () => {
    it("reorderSectionsSchema coerces section ids", () => {
      const result = reorderSectionsSchema.safeParse({ sectionIds: ["1", "2"] });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.sectionIds).toEqual([1, 2]);
    });

    it("formIdParamSchema rejects non-positive ids", () => {
      expect(formIdParamSchema.safeParse({ id: "0" }).success).toBe(false);
    });
  });
});
