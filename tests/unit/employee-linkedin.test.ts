import { describe, it, expect } from "vitest";
import { buildLinkedinStatus, coveragePercent, isOxoTechCompany, monthsBetween } from "../../src/modules/employee-linkedin/linkedinStatus";

describe("monthsBetween", () => {
  it("counts whole calendar months after the hire date", () => {
    expect(monthsBetween("2022-03-15", "2023-03-15")).toBe(12);
    expect(monthsBetween("2022-03-15", "2023-03-14")).toBe(11);
    expect(monthsBetween("2022-01-31", "2022-02-01")).toBe(0);
  });

  it("is null when the LinkedIn date is not after the hire date or a date is missing", () => {
    expect(monthsBetween("2022-03-15", "2022-03-15")).toBeNull();
    expect(monthsBetween("2022-03-15", "2020-01-01")).toBeNull();
    expect(monthsBetween(null, "2023-01-01")).toBeNull();
    expect(monthsBetween("2022-03-15", undefined)).toBeNull();
  });

  it("accepts Date objects", () => {
    expect(monthsBetween(new Date(2022, 0, 1), new Date(2022, 6, 1))).toBe(6);
  });
});

describe("buildLinkedinStatus", () => {
  const base = {
    linkedinProfile: "https://linkedin.com/in/jane",
    linkedinConnectedAt: new Date("2026-01-01T00:00:00Z"),
    linkedinSyncRequestedAt: null,
    linkedinLatestCompany: "Acme",
    linkedinLatestTitle: "Engineer",
    linkedinLatestStartDate: "2024-06-01",
    linkedinSyncedAt: new Date("2026-02-01T00:00:00Z"),
    linkedinSyncError: null,
    hireDate: "2023-06-01",
  };

  it("flags a role that started after joining and reports the months", () => {
    const s = buildLinkedinStatus(base);
    expect(s).toMatchObject({
      connected: true,
      latestCompany: "Acme",
      linkedinUpdateDate: "2024-06-01",
      monthsAfterJoining: 12,
      updatedAfterJoining: true,
      syncPending: false,
    });
  });

  it("shows no flag when the latest role predates joining", () => {
    expect(buildLinkedinStatus({ ...base, linkedinLatestStartDate: "2021-01-01" }).updatedAfterJoining).toBe(false);
  });

  it("hides synced data once disconnected", () => {
    const s = buildLinkedinStatus({ ...base, linkedinConnectedAt: null });
    expect(s).toMatchObject({ connected: false, latestCompany: null, updatedAfterJoining: false, monthsAfterJoining: null });
  });

  it("marks a requested refresh as pending", () => {
    expect(buildLinkedinStatus({ ...base, linkedinSyncRequestedAt: new Date() }).syncPending).toBe(true);
  });
});

describe("isOxoTechCompany", () => {
  it("accepts OXO Tech name variants", () => {
    for (const n of ["OXO Tech", "oxo tech", "OXO Technologies", "OXO Tech (Pvt) Ltd"]) expect(isOxoTechCompany(n)).toBe(true);
  });
  it("rejects other companies and empty values", () => {
    for (const n of ["Acme", "Oxford Tech", "OXO Foods", "", null, undefined]) expect(isOxoTechCompany(n)).toBe(false);
  });
});

describe("coveragePercent", () => {
  const today = new Date(2026, 0, 1); // 2026-01-01
  it("is 100 when LinkedIn lists OXO Tech from the join date or earlier", () => {
    expect(coveragePercent("2025-01-01", "2025-01-01", "OXO Tech", today)).toBe(100);
    expect(coveragePercent("2025-01-01", "2024-06-01", "OXO Tech", today)).toBe(100);
  });
  it("drops as the OXO start date lags the join date", () => {
    // 365-day tenure, LinkedIn shows the last ~182 days -> 50%
    expect(coveragePercent("2025-01-01", "2025-07-02", "OXO Tech", today)).toBe(50);
  });
  it("is 0 when the newest role is not OXO Tech, null when it cannot be judged", () => {
    expect(coveragePercent("2025-01-01", "2025-06-01", "Acme", today)).toBe(0);
    expect(coveragePercent(null, "2025-06-01", "OXO Tech", today)).toBeNull();
    expect(coveragePercent("2025-01-01", "2025-06-01", null, today)).toBeNull();
  });
});

describe("buildLinkedinStatus flag", () => {
  const today = new Date(2026, 0, 1);
  const base = {
    linkedinProfile: "https://linkedin.com/in/jane",
    linkedinConnectedAt: new Date("2025-06-01T00:00:00Z"),
    linkedinSyncRequestedAt: null,
    linkedinLatestCompany: "OXO Tech",
    linkedinLatestTitle: "Engineer",
    linkedinLatestStartDate: "2025-01-01",
    linkedinSyncedAt: new Date("2025-12-01T00:00:00Z"),
    linkedinSyncError: null,
    hireDate: "2025-01-01",
  };
  it("is green when the newest role is OXO Tech", () => {
    expect(buildLinkedinStatus(base, today)).toMatchObject({ flag: "green", coveragePercent: 100, tenureMonths: 12 });
  });
  it("is red when it is another company", () => {
    expect(buildLinkedinStatus({ ...base, linkedinLatestCompany: "Acme" }, today)).toMatchObject({ flag: "red", coveragePercent: 0 });
  });
  it("is red when synced but no role was found", () => {
    expect(buildLinkedinStatus({ ...base, linkedinLatestCompany: null, linkedinLatestStartDate: null }, today).flag).toBe("red");
  });
  it("is pending before the first sync, after a failed sync, or when not connected", () => {
    expect(buildLinkedinStatus({ ...base, linkedinSyncedAt: null }, today).flag).toBe("pending");
    expect(buildLinkedinStatus({ ...base, linkedinSyncError: "boom" }, today).flag).toBe("pending");
    expect(buildLinkedinStatus({ ...base, linkedinConnectedAt: null }, today).flag).toBe("pending");
  });
});
