import { describe, it, expect } from "vitest";
import {
  createCommunicationSchema,
  respondCommunicationSchema,
  communicationIdParamSchema,
} from "../../src/validators/communication.validator";

describe("communication.validator", () => {
  describe("createCommunicationSchema", () => {
    it("accepts a valid payload with recipient user ids as a real array", () => {
      const result = createCommunicationSchema.safeParse({
        title: "Policy update",
        body: "Please review the attached policy.",
        recipientUserIds: [1, 2, 3],
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.recipientUserIds).toEqual([1, 2, 3]);
        expect(result.data.recipientGroupIds).toEqual([]);
        expect(result.data.requiresAcknowledgement).toBe(false);
        expect(result.data.deadlineAt).toBeNull();
      }
    });

    it("accepts recipient ids as a JSON-encoded string (multipart form-data)", () => {
      const result = createCommunicationSchema.safeParse({
        title: "Policy update",
        body: "Body text",
        recipientUserIds: "[1,2]",
        recipientGroupIds: "[]",
        requiresAcknowledgement: "true",
        deadlineAt: "2026-08-01",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.recipientUserIds).toEqual([1, 2]);
        expect(result.data.requiresAcknowledgement).toBe(true);
        expect(result.data.deadlineAt).toBeInstanceOf(Date);
      }
    });

    it("rejects when neither recipient users nor groups are provided", () => {
      const result = createCommunicationSchema.safeParse({
        title: "Title",
        body: "Body",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toEqual(["recipientUserIds"]);
      }
    });

    it("accepts when only group ids are provided", () => {
      const result = createCommunicationSchema.safeParse({
        title: "Title",
        body: "Body",
        recipientGroupIds: [5],
      });
      expect(result.success).toBe(true);
    });

    it("rejects an empty title or body", () => {
      expect(
        createCommunicationSchema.safeParse({
          title: "",
          body: "Body",
          recipientUserIds: [1],
        }).success,
      ).toBe(false);
      expect(
        createCommunicationSchema.safeParse({
          title: "Title",
          body: "",
          recipientUserIds: [1],
        }).success,
      ).toBe(false);
    });

    it("treats a null deadlineAt as null", () => {
      const result = createCommunicationSchema.safeParse({
        title: "Title",
        body: "Body",
        recipientUserIds: [1],
        deadlineAt: null,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.deadlineAt).toBeNull();
      }
    });
  });

  describe("respondCommunicationSchema", () => {
    it("allows an empty response", () => {
      expect(respondCommunicationSchema.safeParse({}).success).toBe(true);
    });

    it("rejects responseText over 2000 chars", () => {
      const result = respondCommunicationSchema.safeParse({
        responseText: "a".repeat(2001),
      });
      expect(result.success).toBe(false);
    });
  });

  describe("communicationIdParamSchema", () => {
    it("coerces a numeric string id", () => {
      const result = communicationIdParamSchema.safeParse({ id: "42" });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.id).toBe(42);
    });

    it("rejects a non-positive id", () => {
      expect(communicationIdParamSchema.safeParse({ id: "0" }).success).toBe(false);
      expect(communicationIdParamSchema.safeParse({ id: "-1" }).success).toBe(false);
    });
  });
});
