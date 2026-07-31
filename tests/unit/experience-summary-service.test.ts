import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/modules/employee-work-history/EmployeeWorkHistory", () => ({
  EmployeeWorkHistoryModel: { listByEmployeeId: vi.fn() },
}));
vi.mock("../../src/employees/Employee", () => ({
  EmployeeModel: { findByEmployeeId: vi.fn() },
}));

import { EmployeeWorkHistoryModel } from "../../src/modules/employee-work-history/EmployeeWorkHistory";
import { EmployeeModel } from "../../src/employees/Employee";
import { experienceSummaryService } from "../../src/modules/employee-work-history/experienceSummary.service";

const listMock = EmployeeWorkHistoryModel.listByEmployeeId as unknown as ReturnType<typeof vi.fn>;
const findByEmployeeIdMock = EmployeeModel.findByEmployeeId as unknown as ReturnType<typeof vi.fn>;

describe("experienceSummaryService.calculate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws a 404 AppError when the employee doesn't exist", async () => {
    findByEmployeeIdMock.mockResolvedValue(null);
    await expect(experienceSummaryService.calculate("EMP1")).rejects.toMatchObject({ statusCode: 404 });
  });

  it("sums durations across non-overlapping work-history entries", async () => {
    findByEmployeeIdMock.mockResolvedValue({ undergraduateDegreeCompletionDate: null });
    listMock.mockResolvedValue([
      { startDate: "2018-01-01", endDate: "2020-01-01", employmentType: "regular" }, // 2 years
      { startDate: "2020-01-01", endDate: "2021-01-01", employmentType: "regular" }, // 1 year
    ]);
    const result = await experienceSummaryService.calculate("EMP1");
    expect(result.totalExperienceYears).toBeCloseTo(3, 1);
    expect(result.totalExperienceExclInternshipYears).toBeCloseTo(3, 1);
    expect(result.hasDegreeDate).toBe(false);
    expect(result.postDegreeExperienceYears).toBe(0);
  });

  it("excludes internship/trainee entries from the 'excl internship' totals", async () => {
    findByEmployeeIdMock.mockResolvedValue({ undergraduateDegreeCompletionDate: null });
    listMock.mockResolvedValue([
      { startDate: "2018-01-01", endDate: "2019-01-01", employmentType: "intern" },
      { startDate: "2019-01-01", endDate: "2021-01-01", employmentType: "regular" },
    ]);
    const result = await experienceSummaryService.calculate("EMP1");
    expect(result.totalExperienceYears).toBeCloseTo(3, 1);
    expect(result.totalExperienceExclInternshipYears).toBeCloseTo(2, 1);
  });

  it("treats a null endDate as ongoing (uses 'now')", async () => {
    findByEmployeeIdMock.mockResolvedValue({ undergraduateDegreeCompletionDate: null });
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    listMock.mockResolvedValue([{ startDate: oneYearAgo.toISOString(), endDate: null, employmentType: "regular" }]);
    const result = await experienceSummaryService.calculate("EMP1");
    expect(result.totalExperienceYears).toBeCloseTo(1, 0);
  });

  it("skips an entry whose endDate is before its startDate", async () => {
    findByEmployeeIdMock.mockResolvedValue({ undergraduateDegreeCompletionDate: null });
    listMock.mockResolvedValue([
      { startDate: "2021-01-01", endDate: "2020-01-01", employmentType: "regular" },
    ]);
    const result = await experienceSummaryService.calculate("EMP1");
    expect(result.totalExperienceYears).toBe(0);
  });

  it("computes post-degree experience by clamping entries to the degree completion date", async () => {
    findByEmployeeIdMock.mockResolvedValue({ undergraduateDegreeCompletionDate: "2019-06-01" });
    listMock.mockResolvedValue([
      // Straddles the degree date: only the portion after 2019-06-01 counts as post-degree.
      { startDate: "2018-06-01", endDate: "2020-06-01", employmentType: "regular" },
    ]);
    const result = await experienceSummaryService.calculate("EMP1");
    expect(result.hasDegreeDate).toBe(true);
    expect(result.totalExperienceYears).toBeCloseTo(2, 1);
    expect(result.postDegreeExperienceYears).toBeCloseTo(1, 1);
  });

  it("excludes entries that end entirely before the degree completion date from post-degree totals", async () => {
    findByEmployeeIdMock.mockResolvedValue({ undergraduateDegreeCompletionDate: "2022-01-01" });
    listMock.mockResolvedValue([{ startDate: "2018-01-01", endDate: "2020-01-01", employmentType: "regular" }]);
    const result = await experienceSummaryService.calculate("EMP1");
    expect(result.postDegreeExperienceYears).toBe(0);
  });

  it("returns zeros for an employee with no work history", async () => {
    findByEmployeeIdMock.mockResolvedValue({ undergraduateDegreeCompletionDate: null });
    listMock.mockResolvedValue([]);
    const result = await experienceSummaryService.calculate("EMP1");
    expect(result).toEqual({
      totalExperienceYears: 0,
      totalExperienceExclInternshipYears: 0,
      postDegreeExperienceYears: 0,
      postDegreeExperienceExclInternshipYears: 0,
      hasDegreeDate: false,
    });
  });
});
