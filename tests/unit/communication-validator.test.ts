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
      // Deadline is computed relative to "now" (rather than hardcoded) so this
      // test - whose purpose is the multipart string->array/boolean/date
      // coercion, not deadline validation - keeps passing regardless of when
      // it's run; see the OCD-515 describe block below for deadline-specific
      // past/today/future coverage.
      const futureDeadline = new Date();
      futureDeadline.setDate(futureDeadline.getDate() + 30);
      const result = createCommunicationSchema.safeParse({
        title: "Policy update",
        body: "Body text",
        recipientUserIds: "[1,2]",
        recipientGroupIds: "[]",
        requiresAcknowledgement: "true",
        deadlineAt: futureDeadline.toISOString().slice(0, 10),
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

    describe("acknowledgement deadline (OCD-515)", () => {
      const isoDaysFromNow = (days: number): string => {
        const d = new Date();
        d.setDate(d.getDate() + days);
        return d.toISOString().slice(0, 10);
      };

      it("rejects a past deadline when acknowledgement is required", () => {
        const result = createCommunicationSchema.safeParse({
          title: "Title",
          body: "Body",
          recipientUserIds: [1],
          requiresAcknowledgement: true,
          deadlineAt: isoDaysFromNow(-1),
        });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].path).toEqual(["deadlineAt"]);
          expect(result.error.issues[0].message).toBe("Acknowledgement deadline cannot be in the past.");
        }
      });

      it("accepts today's date when acknowledgement is required", () => {
        const result = createCommunicationSchema.safeParse({
          title: "Title",
          body: "Body",
          recipientUserIds: [1],
          requiresAcknowledgement: true,
          deadlineAt: isoDaysFromNow(0),
        });
        expect(result.success).toBe(true);
      });

      it("accepts a future date when acknowledgement is required", () => {
        const result = createCommunicationSchema.safeParse({
          title: "Title",
          body: "Body",
          recipientUserIds: [1],
          requiresAcknowledgement: true,
          deadlineAt: isoDaysFromNow(7),
        });
        expect(result.success).toBe(true);
      });

      it("does not reject a past date when acknowledgement is not required", () => {
        const result = createCommunicationSchema.safeParse({
          title: "Title",
          body: "Body",
          recipientUserIds: [1],
          requiresAcknowledgement: false,
          deadlineAt: isoDaysFromNow(-30),
        });
        expect(result.success).toBe(true);
      });
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
