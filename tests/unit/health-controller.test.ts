import { describe, it, expect, vi, beforeEach } from "vitest";
import { HealthController } from "../../src/health/health.controller";

const createRes = () => ({ status: vi.fn() });

describe("HealthController", () => {
  let poolMock: { query: ReturnType<typeof vi.fn> };
  let controller: HealthController;

  beforeEach(() => {
    poolMock = { query: vi.fn() };
    controller = new HealthController(poolMock as any);
  });

  it("health returns an OK status with a timestamp", () => {
    const result = controller.health();
    expect(result.status).toBe("OK");
    expect(new Date(result.timestamp).toString()).not.toBe("Invalid Date");
  });

  describe("dbHealth", () => {
    it("returns success with connection info when the query succeeds", async () => {
      poolMock.query.mockResolvedValue({
        rows: [{ database_name: "oxo", schema_name: "public", db_user: "u", server_time: new Date(), has_tables_in_schema: true }],
      });
      const res = createRes();
      const result = await controller.dbHealth(res as any);
      expect(result.success).toBe(true);
      expect(result.database).toBeDefined();
      expect(res.status).not.toHaveBeenCalled();
    });

    it("sets a 500 status and returns failure details when the query throws", async () => {
      poolMock.query.mockRejectedValue(new Error("connection refused"));
      const res = createRes();
      const result = await controller.dbHealth(res as any);
      expect(result.success).toBe(false);
      expect(result.error).toBe("connection refused");
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe("corsCheck", () => {
    it("reports no origin header when absent", () => {
      const result = controller.corsCheck({ headers: {} } as any);
      expect(result.cors.requestOrigin).toBe("no origin header");
      expect(result.cors.isOriginAllowed).toBe(false);
    });

    it("reports whether the given origin is allowed", () => {
      const result = controller.corsCheck({ headers: { origin: "https://example.com" } } as any);
      expect(result.cors.requestOrigin).toBe("https://example.com");
      expect(typeof result.cors.isOriginAllowed).toBe("boolean");
    });
  });

  it("emailConfigCheck returns SMTP config and troubleshooting tips", () => {
    const result = controller.emailConfigCheck();
    expect(result.success).toBe(true);
    expect(result.config).toBeDefined();
    expect(Array.isArray(result.troubleshooting)).toBe(true);
  });
});
