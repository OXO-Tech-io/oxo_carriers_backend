import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../src/modules/employee-work-history/EmployeeWorkHistory", () => ({
  EmployeeWorkHistoryModel: { listByEmployeeId: vi.fn() },
}));
vi.mock("../../src/modules/employee-education/EmployeeEducation", () => ({
  EmployeeEducationModel: { listByEmployeeId: vi.fn() },
}));
vi.mock("../../src/employees/Employee", () => ({
  EmployeeModel: { findByEmployeeId: vi.fn() },
}));

import { EmployeeWorkHistoryModel } from "../../src/modules/employee-work-history/EmployeeWorkHistory";
import { EmployeeEducationModel } from "../../src/modules/employee-education/EmployeeEducation";
import { EmployeeModel } from "../../src/employees/Employee";
import { experienceSummaryService } from "../../src/modules/employee-work-history/experienceSummary.service";

const workMock = EmployeeWorkHistoryModel.listByEmployeeId as unknown as ReturnType<typeof vi.fn>;
const eduMock = EmployeeEducationModel.listByEmployeeId as unknown as ReturnType<typeof vi.fn>;
const findMock = EmployeeModel.findByEmployeeId as unknown as ReturnType<typeof vi.fn>;

const job = (startDate: string, endDate: string | null, extra: Record<string, unknown> = {}) => ({
  startDate,
  endDate,
  employmentType: "regular",
  careerPath: null,
  ...extra,
});
const degree = (dateAwarded: string | null, extra: Record<string, unknown> = {}) => ({
  qualificationLevel: "degree",
  isOngoing: false,
  dateAwarded,
  ...extra,
});

describe("experienceSummaryService.calculate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2024, 0, 1, 12)); // 2024-01-01 local
    findMock.mockResolvedValue({ careerPath: null, undergraduateDegreeCompletionDate: null });
    eduMock.mockResolvedValue([]);
    workMock.mockResolvedValue([]);
  });
  afterEach(() => vi.useRealTimers());

  it("throws a 404 when the employee doesn't exist", async () => {
    findMock.mockResolvedValue(null);
    await expect(experienceSummaryService.calculate("EMP1")).rejects.toMatchObject({ statusCode: 404 });
  });

  it("returns zeros for an employee with no work history", async () => {
    const r = await experienceSummaryService.calculate("EMP1");
    expect(r.total.totalDays).toBe(0);
    expect(r.hasDegreeDate).toBe(false);
    expect(r.entryCount).toBe(0);
  });

  it("totals every entry and excludes only internships from the 'without internship' figures", async () => {
    workMock.mockResolvedValue([
      job("2018-01-01", "2019-01-01", { employmentType: "intern" }),
      job("2019-01-01", "2021-01-01"),
      job("2021-01-01", "2021-07-01", { employmentType: "trainee" }),
    ]);
    const r = await experienceSummaryService.calculate("EMP1");
    expect(r.total).toMatchObject({ years: 3, months: 6 });
    expect(r.totalExclInternship).toMatchObject({ years: 2, months: 6 });
  });

  it("counts overlapping roles once", async () => {
    workMock.mockResolvedValue([job("2018-01-01", "2019-01-01"), job("2018-07-01", "2019-07-01")]);
    const r = await experienceSummaryService.calculate("EMP1");
    expect(r.total).toMatchObject({ years: 1, months: 6 });
  });

  it("derives the degree date from the earliest completed Bachelor's graduation month", async () => {
    eduMock.mockResolvedValue([
      degree("2021-09-20"),
      degree("2019-06-23"),
      degree("2018-01-01", { isOngoing: true }),
      { qualificationLevel: "masters", isOngoing: false, dateAwarded: "2017-01-01" },
    ]);
    workMock.mockResolvedValue([job("2018-06-01", "2020-06-01")]);
    const r = await experienceSummaryService.calculate("EMP1");
    expect(r.degreeCompletionDate).toBe("2019-06-01");
    expect(r.degreeDateSource).toBe("education");
    expect(r.total).toMatchObject({ years: 2, months: 0 });
    expect(r.postDegree).toMatchObject({ years: 1, months: 0 });
  });

  it("excludes career breaks and pre-degree work from post-degree experience, and internships from the 'without internship' variant", async () => {
    eduMock.mockResolvedValue([degree("2019-01-15")]);
    workMock.mockResolvedValue([
      job("2017-01-01", "2018-01-01"), // entirely pre-degree
      job("2019-01-01", "2019-07-01", { employmentType: "intern" }), // 6 post-degree months, internship
      job("2020-01-01", "2021-01-01"), // after a 6-month break; 1 year
    ]);
    const r = await experienceSummaryService.calculate("EMP1");
    expect(r.postDegree).toMatchObject({ years: 1, months: 6 });
    expect(r.postDegreeExclInternship).toMatchObject({ years: 1, months: 0 });
  });

  it("falls back to the profile-level degree completion date when no education entry exists", async () => {
    findMock.mockResolvedValue({ careerPath: null, undergraduateDegreeCompletionDate: "2020-05-10" });
    workMock.mockResolvedValue([job("2020-01-01", "2021-06-01")]);
    const r = await experienceSummaryService.calculate("EMP1");
    expect(r.degreeCompletionDate).toBe("2020-05-01");
    expect(r.degreeDateSource).toBe("profile");
    expect(r.postDegree).toMatchObject({ years: 1, months: 1 });
  });

  it("reports post-degree as zero (hasDegreeDate=false) when no degree date is known", async () => {
    workMock.mockResolvedValue([job("2018-01-01", "2019-01-01")]);
    const r = await experienceSummaryService.calculate("EMP1");
    expect(r.hasDegreeDate).toBe(false);
    expect(r.postDegree.totalDays).toBe(0);
  });

  it("computes experience per career path and the current path, counting uncategorised entries", async () => {
    findMock.mockResolvedValue({ careerPath: "qa", undergraduateDegreeCompletionDate: null });
    workMock.mockResolvedValue([
      job("2018-01-01", "2019-01-01", { careerPath: "qa" }),
      job("2020-01-01", "2021-01-01", { careerPath: "qa" }),
      job("2019-01-01", "2019-07-01", { careerPath: "pm" }),
      job("2021-01-01", "2022-01-01"),
    ]);
    const r = await experienceSummaryService.calculate("EMP1");
    expect(r.currentCareerPath).toBe("qa");
    expect(r.byCareerPath.qa).toMatchObject({ years: 2, months: 0 });
    expect(r.byCareerPath.pm).toMatchObject({ years: 0, months: 6 });
    expect(r.byCareerPath.sales.totalDays).toBe(0);
    expect(r.uncategorizedEntryCount).toBe(1);
  });

  it("treats a null endDate as ongoing (up to today)", async () => {
    workMock.mockResolvedValue([job("2023-01-01", null)]);
    const r = await experienceSummaryService.calculate("EMP1");
    expect(r.total).toMatchObject({ years: 1, months: 0 });
  });
});
