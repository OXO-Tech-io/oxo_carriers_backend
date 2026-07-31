import { describe, it, expect } from "vitest";
import { matchesComparator, isQuestionVisible } from "../../src/modules/forms/formLogic";

describe("formLogic", () => {
  describe("matchesComparator", () => {
    it("equals matches scalar and array (includes) answers", () => {
      expect(matchesComparator("equals", "yes", "yes")).toBe(true);
      expect(matchesComparator("equals", "no", "yes")).toBe(false);
      expect(matchesComparator("equals", ["a", "b"], "a")).toBe(true);
      expect(matchesComparator("equals", ["a", "b"], "c")).toBe(false);
    });

    it("not_equals is the negation of equals", () => {
      expect(matchesComparator("not_equals", "yes", "yes")).toBe(false);
      expect(matchesComparator("not_equals", "no", "yes")).toBe(true);
    });

    it("contains is a case-insensitive substring match", () => {
      expect(matchesComparator("contains", "Hello World", "world")).toBe(true);
      expect(matchesComparator("contains", "Hello World", "xyz")).toBe(false);
      expect(matchesComparator("contains", ["Alpha", "Beta"], "beta")).toBe(true);
    });

    it("greater_than / less_than compare numerically", () => {
      expect(matchesComparator("greater_than", "10", "5")).toBe(true);
      expect(matchesComparator("greater_than", "3", "5")).toBe(false);
      expect(matchesComparator("less_than", "3", "5")).toBe(true);
    });

    it("is_empty / is_not_empty handle null, blank, and empty arrays", () => {
      expect(matchesComparator("is_empty", null, undefined)).toBe(true);
      expect(matchesComparator("is_empty", "", undefined)).toBe(true);
      expect(matchesComparator("is_empty", "  ", undefined)).toBe(true);
      expect(matchesComparator("is_empty", [], undefined)).toBe(true);
      expect(matchesComparator("is_empty", "value", undefined)).toBe(false);
      expect(matchesComparator("is_not_empty", "value", undefined)).toBe(true);
      expect(matchesComparator("is_not_empty", "", undefined)).toBe(false);
    });

    it("returns true for an unrecognized comparator (fail-open)", () => {
      expect(matchesComparator("unknown" as any, "anything", "x")).toBe(true);
    });
  });

  describe("isQuestionVisible", () => {
    it("is visible when no rules target the question", () => {
      expect(isQuestionVisible(1, [], {})).toBe(true);
    });

    it("shows the question when a 'show' rule's condition matches", () => {
      const rules = [
        { targetQuestionId: 2, sourceQuestionId: 1, comparator: "equals", comparisonValue: "yes", action: "show", combinator: "all" },
      ] as any;
      expect(isQuestionVisible(2, rules, { 1: "yes" })).toBe(true);
      expect(isQuestionVisible(2, rules, { 1: "no" })).toBe(false);
    });

    it("hides the question when a 'hide' rule's condition matches (inverted)", () => {
      const rules = [
        { targetQuestionId: 2, sourceQuestionId: 1, comparator: "equals", comparisonValue: "yes", action: "hide", combinator: "all" },
      ] as any;
      expect(isQuestionVisible(2, rules, { 1: "yes" })).toBe(false);
      expect(isQuestionVisible(2, rules, { 1: "no" })).toBe(true);
    });

    it("combinator 'all' requires every targeting rule to pass", () => {
      const rules = [
        { targetQuestionId: 3, sourceQuestionId: 1, comparator: "equals", comparisonValue: "a", action: "show", combinator: "all" },
        { targetQuestionId: 3, sourceQuestionId: 2, comparator: "equals", comparisonValue: "b", action: "show", combinator: "all" },
      ] as any;
      expect(isQuestionVisible(3, rules, { 1: "a", 2: "b" })).toBe(true);
      expect(isQuestionVisible(3, rules, { 1: "a", 2: "x" })).toBe(false);
    });

    it("combinator 'any' requires at least one targeting rule to pass", () => {
      const rules = [
        { targetQuestionId: 3, sourceQuestionId: 1, comparator: "equals", comparisonValue: "a", action: "show", combinator: "any" },
        { targetQuestionId: 3, sourceQuestionId: 2, comparator: "equals", comparisonValue: "b", action: "show", combinator: "any" },
      ] as any;
      expect(isQuestionVisible(3, rules, { 1: "x", 2: "b" })).toBe(true);
      expect(isQuestionVisible(3, rules, { 1: "x", 2: "y" })).toBe(false);
    });
  });
});
