import { describe, it, expect } from "vitest";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { BadRequestException } from "@nestjs/common";
import { CreateNoticeDto } from "../../src/modules/notices/dto/create-notice.dto";
import { UpdateNoticeDto } from "../../src/modules/notices/dto/update-notice.dto";
import { noticeImageMulterOptions } from "../../src/modules/notices/notices.upload";

const hasErrorOn = (errors: ReturnType<typeof validate> extends Promise<infer E> ? E : never, property: string) =>
  (errors as any[]).some((e) => e.property === property);

describe("CreateNoticeDto validation", () => {
  const valid = {
    title: "A notice",
    message: "Something everyone should read",
    startAt: "2026-01-01T00:00:00.000Z",
    endAt: "2026-02-01T00:00:00.000Z",
  };

  it("accepts a minimal valid payload", async () => {
    const dto = plainToInstance(CreateNoticeDto, valid);
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it("rejects a title longer than 100 characters (OCD-567)", async () => {
    const dto = plainToInstance(CreateNoticeDto, { ...valid, title: "x".repeat(101) });
    const errors = await validate(dto);
    expect(hasErrorOn(errors, "title")).toBe(true);
  });

  it("accepts a title of exactly 100 characters", async () => {
    const dto = plainToInstance(CreateNoticeDto, { ...valid, title: "x".repeat(100) });
    const errors = await validate(dto);
    expect(hasErrorOn(errors, "title")).toBe(false);
  });

  it("rejects a message longer than 1000 characters (OCD-567)", async () => {
    const dto = plainToInstance(CreateNoticeDto, { ...valid, message: "x".repeat(1001) });
    const errors = await validate(dto);
    expect(hasErrorOn(errors, "message")).toBe(true);
  });

  it("accepts a message of exactly 1000 characters", async () => {
    const dto = plainToInstance(CreateNoticeDto, { ...valid, message: "x".repeat(1000) });
    const errors = await validate(dto);
    expect(hasErrorOn(errors, "message")).toBe(false);
  });

  it("rejects a missing startAt (required on create, OCD-565)", async () => {
    const { startAt, ...withoutStartAt } = valid;
    const dto = plainToInstance(CreateNoticeDto, withoutStartAt);
    const errors = await validate(dto);
    expect(hasErrorOn(errors, "startAt")).toBe(true);
  });

  it("rejects a non-ISO startAt", async () => {
    const dto = plainToInstance(CreateNoticeDto, { ...valid, startAt: "not-a-date" });
    const errors = await validate(dto);
    expect(hasErrorOn(errors, "startAt")).toBe(true);
  });

  it("rejects a missing endAt (required on create, OCD-565)", async () => {
    const { endAt, ...withoutEndAt } = valid;
    const dto = plainToInstance(CreateNoticeDto, withoutEndAt);
    const errors = await validate(dto);
    expect(hasErrorOn(errors, "endAt")).toBe(true);
  });

  it("accepts a valid endAt strictly after startAt", async () => {
    const dto = plainToInstance(CreateNoticeDto, { ...valid, endAt: "2026-02-01T00:00:00.000Z" });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it("rejects an endAt before startAt", async () => {
    const dto = plainToInstance(CreateNoticeDto, {
      ...valid,
      startAt: "2026-02-01T00:00:00.000Z",
      endAt: "2026-01-01T00:00:00.000Z",
    });
    const errors = await validate(dto);
    expect(hasErrorOn(errors, "endAt")).toBe(true);
  });

  it("rejects an endAt equal to startAt (must be strictly after)", async () => {
    const dto = plainToInstance(CreateNoticeDto, { ...valid, endAt: valid.startAt });
    const errors = await validate(dto);
    expect(hasErrorOn(errors, "endAt")).toBe(true);
  });

  it("leaves endAt unvalidated by @IsAfterStartAt when it isn't a valid date (that's @IsDateString's job)", async () => {
    const dto = plainToInstance(CreateNoticeDto, { ...valid, endAt: "not-a-date" });
    const errors = await validate(dto);
    const endAtError = (errors as any[]).find((e) => e.property === "endAt");
    expect(endAtError).toBeDefined();
    expect(endAtError.constraints).toHaveProperty("isDateString");
    expect(endAtError.constraints).not.toHaveProperty("isAfterStartAt");
  });
});

describe("UpdateNoticeDto validation", () => {
  it("accepts an empty payload (every field optional)", async () => {
    const dto = plainToInstance(UpdateNoticeDto, {});
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it("rejects a title longer than 100 characters (OCD-567)", async () => {
    const dto = plainToInstance(UpdateNoticeDto, { title: "x".repeat(101) });
    const errors = await validate(dto);
    expect(hasErrorOn(errors, "title")).toBe(true);
  });

  it("rejects a message longer than 1000 characters (OCD-567)", async () => {
    const dto = plainToInstance(UpdateNoticeDto, { message: "x".repeat(1001) });
    const errors = await validate(dto);
    expect(hasErrorOn(errors, "message")).toBe(true);
  });

  it("rejects an endAt before startAt when both are sent together", async () => {
    const dto = plainToInstance(UpdateNoticeDto, {
      startAt: "2026-02-01T00:00:00.000Z",
      endAt: "2026-01-01T00:00:00.000Z",
    });
    const errors = await validate(dto);
    expect(hasErrorOn(errors, "endAt")).toBe(true);
  });

  it("accepts an endAt-only payload at the DTO level (no startAt to compare against)", async () => {
    // NoticesService.update() re-validates this against the persisted
    // startAt for a partial PATCH - see notices-service.test.ts's
    // "validates endAt > startAt against the merged, persisted values" case.
    const dto = plainToInstance(UpdateNoticeDto, { endAt: "2026-01-01T00:00:00.000Z" });
    const errors = await validate(dto);
    expect(hasErrorOn(errors, "endAt")).toBe(false);
  });
});

describe("notice image upload fileFilter (OCD-570)", () => {
  function callFilter(mimetype: string): { err: unknown; accept: boolean | undefined } {
    let result: { err: unknown; accept: boolean | undefined } = { err: undefined, accept: undefined };
    noticeImageMulterOptions.fileFilter!({} as any, { mimetype } as any, (err, accept) => {
      result = { err, accept };
    });
    return result;
  }

  it.each(["image/jpeg", "image/jpg", "image/png", "image/gif"])("accepts %s", (mimetype) => {
    const { err, accept } = callFilter(mimetype);
    expect(err).toBeNull();
    expect(accept).toBe(true);
  });

  it("rejects a non-image mimetype (e.g. an .xlsx upload) with a clean BadRequestException", () => {
    const { err, accept } = callFilter(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(accept).toBe(false);
    expect(err).toBeInstanceOf(BadRequestException);
    expect((err as BadRequestException).message).toBe(
      "Unsupported file type. Only JPG, PNG, and GIF images are allowed for the notice image.",
    );
  });

  it("rejects a PDF, unlike the shared documentUploadMulterOptions it used to re-export", () => {
    const { err, accept } = callFilter("application/pdf");
    expect(accept).toBe(false);
    expect(err).toBeInstanceOf(BadRequestException);
  });
});
