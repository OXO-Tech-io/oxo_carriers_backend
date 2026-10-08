import { describe, it, expect } from "vitest";
import {
  createEventSchema,
  recordParticipationSchema,
  eventIdParamSchema,
} from "../../src/validators/event.validator";

describe("event.validator", () => {
  describe("createEventSchema", () => {
    it("accepts a minimal valid event", () => {
      const result = createEventSchema.safeParse({
        name: "Annual Meetup",
        eventDate: "2026-12-01",
      });
      expect(result.success).toBe(true);
    });

    it("rejects an empty name", () => {
      expect(
        createEventSchema.safeParse({ name: "", eventDate: "2026-12-01" }).success,
      ).toBe(false);
    });

    it("rejects a missing eventDate", () => {
      expect(createEventSchema.safeParse({ name: "Meetup" }).success).toBe(false);
    });
  });

  describe("recordParticipationSchema", () => {
    it("accepts a valid participants list, coercing userId", () => {
      const result = recordParticipationSchema.safeParse({
        participants: [{ userId: "1", participated: true }],
      });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.participants[0].userId).toBe(1);
    });

    it("rejects an empty participants array", () => {
      expect(recordParticipationSchema.safeParse({ participants: [] }).success).toBe(false);
    });

    it("allows willParticipate to be null", () => {
      const result = recordParticipationSchema.safeParse({
        participants: [{ userId: 1, participated: false, willParticipate: null }],
      });
      expect(result.success).toBe(true);
    });
  });

  describe("eventIdParamSchema", () => {
    it("coerces a valid id and rejects non-positive ones", () => {
      expect(eventIdParamSchema.safeParse({ id: "10" }).success).toBe(true);
      expect(eventIdParamSchema.safeParse({ id: "0" }).success).toBe(false);
    });
  });
});
