import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/modules/communications/communication.service", () => ({
  communicationService: {
    create: vi.fn(),
    listAll: vi.fn(),
    delete: vi.fn(),
    listMine: vi.fn(),
    respond: vi.fn(),
    generateReport: vi.fn(),
  },
}));

import { communicationService } from "../../src/modules/communications/communication.service";
import { CommunicationsService } from "../../src/modules/communications/communications.service";

const cs = communicationService as unknown as Record<string, ReturnType<typeof vi.fn>>;

describe("CommunicationsService (thin wrapper)", () => {
  const service = new CommunicationsService();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("create parses the body with the zod schema and forwards fields positionally", async () => {
    cs.create.mockResolvedValue({ id: 1 });
    const result = await service.create(
      9,
      { title: "Hello", body: "World", recipientUserIds: [1, 2] },
      [],
    );
    expect(cs.create).toHaveBeenCalledWith("Hello", "World", [1, 2], [], 9, [], false, null);
    expect(result).toEqual({ id: 1 });
  });

  it("create propagates a ZodError for an invalid body", async () => {
    await expect(service.create(9, { title: "" }, [])).rejects.toThrow();
  });

  it("listAll/delete/listMine delegate directly", async () => {
    cs.listAll.mockResolvedValue([1]);
    cs.delete.mockResolvedValue(undefined);
    cs.listMine.mockResolvedValue([2]);

    expect(await service.listAll()).toEqual([1]);
    await service.delete(5);
    expect(cs.delete).toHaveBeenCalledWith(5);
    expect(await service.listMine("EMP1")).toEqual([2]);
    expect(cs.listMine).toHaveBeenCalledWith("EMP1");
  });

  it("respond forwards responseText and returns an empty object", async () => {
    cs.respond.mockResolvedValue(undefined);
    const result = await service.respond(1, "EMP1", { responseText: "ack" } as any);
    expect(cs.respond).toHaveBeenCalledWith(1, "EMP1", "ack");
    expect(result).toEqual({});
  });

  it("generateReport delegates with an optional communicationId", async () => {
    cs.generateReport.mockResolvedValue(Buffer.from("x"));
    await service.generateReport();
    expect(cs.generateReport).toHaveBeenCalledWith(undefined);
    await service.generateReport(3);
    expect(cs.generateReport).toHaveBeenCalledWith(3);
  });
});
