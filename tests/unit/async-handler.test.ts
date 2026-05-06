import { describe, it, expect, vi } from "vitest";
import { asyncHandler } from "../../src/utils/asyncHandler";

describe("asyncHandler", () => {
  it("calls wrapped async function successfully", async () => {
    const next = vi.fn();
    const fn = vi.fn().mockResolvedValue(undefined);
    const handler = asyncHandler(fn);

    handler({} as never, {} as never, next);
    await Promise.resolve();

    expect(fn).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it("forwards errors to next", async () => {
    const next = vi.fn();
    const error = new Error("boom");
    const fn = vi.fn().mockRejectedValue(error);
    const handler = asyncHandler(fn);

    handler({} as never, {} as never, next);
    await Promise.resolve();

    expect(next).toHaveBeenCalledWith(error);
  });
});
