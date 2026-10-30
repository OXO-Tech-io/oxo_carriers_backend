import { describe, it, expect, vi, beforeEach } from "vitest";
import { AttendanceGateway } from "../../src/modules/attendance/attendance.gateway";

function fakeSocket(id: string, deviceId?: string) {
  return {
    id,
    handshake: { query: deviceId !== undefined ? { deviceId } : {}, auth: {} },
    data: {} as Record<string, unknown>,
    emit: vi.fn(),
    disconnect: vi.fn(),
  } as any;
}

describe("AttendanceGateway", () => {
  let gateway: AttendanceGateway;

  beforeEach(() => {
    gateway = new AttendanceGateway();
  });

  it("rejects a connection with no deviceId", () => {
    const client = fakeSocket("s1");

    gateway.handleConnection(client);

    expect(client.disconnect).toHaveBeenCalledWith(true);
    expect(gateway.isDeviceConnected(undefined)).toBe(false);
  });

  it("registers a connection by deviceId and delivers pushed events to it", () => {
    const client = fakeSocket("s1", "WKS-1");

    gateway.handleConnection(client);
    const sent = gateway.pushToDevice("WKS-1", {
      type: "clock_in" as any,
      employeeId: "EMP1",
      occurredAt: "2026-01-01T00:00:00.000Z",
    });

    expect(sent).toBe(true);
    expect(client.emit).toHaveBeenCalledWith(
      "attendance:event",
      expect.objectContaining({ type: "clock_in", employeeId: "EMP1" }),
    );
  });

  it("pushToDevice is a no-op when the device isn't connected", () => {
    const sent = gateway.pushToDevice("WKS-404", {
      type: "clock_out" as any,
      employeeId: "EMP1",
      occurredAt: "2026-01-01T00:00:00.000Z",
    });

    expect(sent).toBe(false);
  });

  it("a later connection for the same deviceId replaces the earlier one", () => {
    const first = fakeSocket("s1", "WKS-1");
    const second = fakeSocket("s2", "WKS-1");

    gateway.handleConnection(first);
    gateway.handleConnection(second);

    expect(first.disconnect).toHaveBeenCalledWith(true);
    gateway.pushToDevice("WKS-1", { type: "clock_in" as any, employeeId: "EMP1", occurredAt: "now" });
    expect(second.emit).toHaveBeenCalled();
    expect(first.emit).not.toHaveBeenCalled();
  });

  it("handleDisconnect frees the deviceId", () => {
    const client = fakeSocket("s1", "WKS-1");
    gateway.handleConnection(client);

    gateway.handleDisconnect(client);

    expect(gateway.isDeviceConnected("WKS-1")).toBe(false);
  });
});
