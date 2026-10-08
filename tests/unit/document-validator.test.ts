import { describe, it, expect } from "vitest";
import { createDocumentSchema } from "../../src/validators/document.validator";

describe("document.validator", () => {
  describe("createDocumentSchema", () => {
    it("accepts an 'all' target with no individualEmployeeIds", () => {
      const result = createDocumentSchema.safeParse({
        title: "Company Policy",
        targetType: "all",
        version: "1.0",
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
        version: "1.0",
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
        version: "1.0",
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
        version: "1.0",
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
        version: "1.0",
      });
      expect(result.success).toBe(false);
    });

    it("rejects an invalid targetType", () => {
      const result = createDocumentSchema.safeParse({
        title: "Contract",
        targetType: "everyone",
        version: "1.0",
      });
      expect(result.success).toBe(false);
    });

    it("requires a non-empty version", () => {
      const result = createDocumentSchema.safeParse({
        title: "Contract",
        targetType: "all",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((issue) => issue.path[0] === "version")).toBe(true);
      }
    });

    it("rejects an empty-string version", () => {
      const result = createDocumentSchema.safeParse({
        title: "Contract",
        targetType: "all",
        version: "",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((issue) => issue.path[0] === "version")).toBe(true);
      }
    });

    it("rejects a version longer than 50 characters", () => {
      const result = createDocumentSchema.safeParse({
        title: "Contract",
        targetType: "all",
        version: "v".repeat(51),
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((issue) => issue.path[0] === "version")).toBe(true);
      }
    });

    it("defaults isMandatoryViewing to false when omitted", () => {
      const result = createDocumentSchema.safeParse({
        title: "Contract",
        targetType: "all",
        version: "1.0",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.isMandatoryViewing).toBe(false);
      }
    });

    it("coerces a real boolean isMandatoryViewing", () => {
      const result = createDocumentSchema.safeParse({
        title: "Contract",
        targetType: "all",
        version: "1.0",
        isMandatoryViewing: true,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.isMandatoryViewing).toBe(true);
      }
    });

    it("coerces isMandatoryViewing from the multipart string form 'true'", () => {
      const result = createDocumentSchema.safeParse({
        title: "Contract",
        targetType: "all",
        version: "1.0",
        isMandatoryViewing: "true",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.isMandatoryViewing).toBe(true);
      }
    });

    it("coerces isMandatoryViewing from the multipart string form 'false'", () => {
      const result = createDocumentSchema.safeParse({
        title: "Contract",
        targetType: "all",
        version: "1.0",
        isMandatoryViewing: "false",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.isMandatoryViewing).toBe(false);
      }
    });
  });
});
