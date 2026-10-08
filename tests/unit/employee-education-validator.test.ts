import { describe, it, expect } from "vitest";
import {
  educationAfterSchema,
  employeeIdParamSchema,
} from "../../src/validators/employeeEducation.validator";

describe("employeeEducation.validator", () => {
  describe("educationAfterSchema", () => {
    it("accepts a completed qualification with a dateAwarded", () => {
      const result = educationAfterSchema.safeParse({
        qualificationLevel: "degree",
        qualificationTitle: "BSc Computer Science",
        awardingInstitution: "University of Colombo",
        dateAwarded: "2020-06-15",
      });
      expect(result.success).toBe(true);
    });

    it("accepts an ongoing qualification without a dateAwarded", () => {
      const result = educationAfterSchema.safeParse({
        qualificationLevel: "masters",
        qualificationTitle: "MSc Data Science",
        awardingInstitution: "University of Moratuwa",
        isOngoing: true,
      });
      expect(result.success).toBe(true);
    });

    it("rejects a non-ongoing qualification missing dateAwarded", () => {
      const result = educationAfterSchema.safeParse({
        qualificationLevel: "degree",
        qualificationTitle: "BSc",
        awardingInstitution: "Uni",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toEqual(["dateAwarded"]);
      }
    });

    it("rejects an invalid qualificationLevel", () => {
      const result = educationAfterSchema.safeParse({
        qualificationLevel: "not_a_level",
        qualificationTitle: "BSc",
        awardingInstitution: "Uni",
        dateAwarded: "2020-06-15",
      });
      expect(result.success).toBe(false);
    });

    it("rejects a malformed date", () => {
      const result = educationAfterSchema.safeParse({
        qualificationLevel: "degree",
        qualificationTitle: "BSc",
        awardingInstitution: "Uni",
        dateAwarded: "15-06-2020",
      });
      expect(result.success).toBe(false);
    });

    it("rejects an empty qualificationTitle", () => {
      const result = educationAfterSchema.safeParse({
        qualificationLevel: "degree",
        qualificationTitle: "",
        awardingInstitution: "Uni",
        dateAwarded: "2020-06-15",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("employeeIdParamSchema", () => {
    it("accepts a non-empty employeeId", () => {
      expect(employeeIdParamSchema.safeParse({ employeeId: "EMP001" }).success).toBe(true);
    });

    it("rejects an empty employeeId", () => {
      expect(employeeIdParamSchema.safeParse({ employeeId: "" }).success).toBe(false);
    });
  });
});
