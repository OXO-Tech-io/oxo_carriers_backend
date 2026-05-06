import { describe, it, expect, vi } from "vitest";
import { ok, created, noContent } from "../../src/utils/response";

const createRes = () => {
  const res = {
    status: vi.fn(),
    json: vi.fn(),
    send: vi.fn(),
  };
  res.status.mockReturnValue(res);
  return res;
};

describe("response utils", () => {
  it("ok returns 200 response", () => {
    const res = createRes();
    ok(res as never, { id: 1 }, "Done");

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: "Done",
      data: { id: 1 },
    });
  });

  it("created returns 201 response", () => {
    const res = createRes();
    created(res as never, { id: 2 }, "Created now");

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: "Created now",
      data: { id: 2 },
    });
  });

  it("noContent returns 204 response", () => {
    const res = createRes();
    noContent(res as never);

    expect(res.status).toHaveBeenCalledWith(204);
    expect(res.send).toHaveBeenCalled();
  });
});
