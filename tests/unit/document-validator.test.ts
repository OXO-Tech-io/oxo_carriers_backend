import { describe, it, expect } from "vitest";
import { createDocumentSchema } from "../../src/validators/document.validator";

describe("document.validator", () => {
  describe("createDocumentSchema", () => {
    it("accepts an 'all' target with no individualEmployeeIds", () => {
      const result = createDocumentSchema.safeParse({
        title: "Company Policy",
        targetType: "all",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.individualEmployeeIds).toEqual([]);
      }
    });

    it("accepts individualEmployeeIds as a real array", () => {
      const result = createDocumentSchema.safeParse({
        title: "Contract",
        targetType: "individual",
        individualEmployeeIds: [1, 2, 3],
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.individualEmployeeIds).toEqual([1, 2, 3]);
      }
    });

    it("accepts individualEmployeeIds as a JSON-encoded string (multipart form-data)", () => {
      const result = createDocumentSchema.safeParse({
        title: "Contract",
        targetType: "individual",
        individualEmployeeIds: "[1,2]",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.individualEmployeeIds).toEqual([1, 2]);
      }
    });

    it("rejects an individual target with no employees", () => {
      const result = createDocumentSchema.safeParse({
        title: "Contract",
        targetType: "individual",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toEqual(["individualEmployeeIds"]);
      }
    });

    it("rejects an empty title", () => {
      const result = createDocumentSchema.safeParse({
        title: "",
        targetType: "all",
      });
      expect(result.success).toBe(false);
    });

    it("rejects an invalid targetType", () => {
      const result = createDocumentSchema.safeParse({
        title: "Contract",
        targetType: "everyone",
      });
      expect(result.success).toBe(false);
    });
  });
});
