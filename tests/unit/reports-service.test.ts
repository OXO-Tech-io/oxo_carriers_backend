import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/config/database", () => ({
  default: { query: vi.fn() },
}));
vi.mock("../../src/employees/Employee", () => ({
  EmployeeModel: { findByEmployeeIds: vi.fn() },
}));

import pool from "../../src/config/database";
import { EmployeeModel } from "../../src/employees/Employee";
import { ReportsService } from "../../src/modules/reports/reports.service";

const poolQueryMock = (pool as any).query as ReturnType<typeof vi.fn>;
const findByEmployeeIdsMock = EmployeeModel.findByEmployeeIds as unknown as ReturnType<typeof vi.fn>;

describe("ReportsService", () => {
  const service = new ReportsService();

  beforeEach(() => {
    vi.clearAllMocks();
    findByEmployeeIdsMock.mockResolvedValue(new Map());
  });

  describe("getLeaveReportData", () => {
    it("builds a parameterized query for the given filters and attaches names", async () => {
      poolQueryMock.mockResolvedValue({ rows: [{ employee_id: "EMP1", start_date: "2026-01-01" }] });
      findByEmployeeIdsMock.mockResolvedValue(new Map([["EMP1", { firstName: "Jane", lastName: "Doe" }]]));

      const result = await service.getLeaveReportData({ department: "Eng", year: "2026", status: "pending" });
      const [query, params] = poolQueryMock.mock.calls[0];
      expect(query).toContain("u.department = $1");
      expect(query).toContain("EXTRACT(YEAR FROM lr.start_date) = $2");
      expect(query).toContain("lr.status = $3");
      expect(params).toEqual(["Eng", "2026", "pending"]);
      expect(result[0]).toMatchObject({ first_name: "Jane", last_name: "Doe" });
    });

    it("omits filter clauses that aren't provided", async () => {
      poolQueryMock.mockResolvedValue({ rows: [] });
      await service.getLeaveReportData({});
      const [query, params] = poolQueryMock.mock.calls[0];
      expect(query).not.toContain("$1");
      expect(params).toEqual([]);
    });
  });

  describe("getSalaryReportData", () => {
    it("sorts by month_year desc, then first_name as a tiebreak", async () => {
      poolQueryMock.mockResolvedValue({
        rows: [
          { employee_id: "A", month_year: "2026-01-01" },
          { employee_id: "B", month_year: "2026-01-01" },
        ],
      });
      findByEmployeeIdsMock.mockResolvedValue(
        new Map([
          ["A", { firstName: "Zeta" }],
          ["B", { firstName: "Alpha" }],
        ]),
      );
      const result = await service.getSalaryReportData({});
      expect(result.map((r: any) => r.first_name)).toEqual(["Alpha", "Zeta"]);
    });
  });

  describe("getDashboardMetrics", () => {
    it("parses numeric aggregates from each query", async () => {
      poolQueryMock
        .mockResolvedValueOnce({ rows: [{ count: "42" }] }) // totalEmployees
        .mockResolvedValueOnce({ rows: [{ count: "3" }] }) // pendingLeaveRequests
        .mockResolvedValueOnce({ rows: [{ count: "5" }] }) // leaveRequestsThisMonth
        // net_salary is PGP-encrypted ciphertext in production; decryptSalary()
        // passes plain (non "iv:hex") strings through unchanged, so these can
        // stand in for decrypted values without needing SALARY_ENCRYPTION_KEY.
        .mockResolvedValueOnce({ rows: [{ net_salary: "50000.25" }, { net_salary: "100000.25" }] }) // salaries this month
        .mockResolvedValueOnce({ rows: [{ department: "Eng", count: "7" }] }); // dept distribution

      const result = await service.getDashboardMetrics();
      expect(result).toEqual({
        totalEmployees: 42,
        pendingLeaveRequests: 3,
        leaveRequestsThisMonth: 5,
        salariesPaidThisMonth: 2,
        totalSalaryPaid: 150000.5,
        departmentLeaveDistribution: [{ department: "Eng", count: "7" }],
      });
    });

    it("defaults totalSalaryPaid to 0 when there are no paid salaries this month", async () => {
      poolQueryMock
        .mockResolvedValueOnce({ rows: [{ count: "0" }] })
        .mockResolvedValueOnce({ rows: [{ count: "0" }] })
        .mockResolvedValueOnce({ rows: [{ count: "0" }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await service.getDashboardMetrics();
      expect(result.salariesPaidThisMonth).toBe(0);
      expect(result.totalSalaryPaid).toBe(0);
    });
  });

  describe("getSubmissionsBreakdown", () => {
    const now = new Date("2026-07-31T12:00:00.000Z");

    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(now);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("classifies form/comm status as on_time, late, overdue, and pending", async () => {
      poolQueryMock
        .mockResolvedValueOnce({
          rows: [
            // submitted before deadline -> on_time
            { distribution_id: 1, form_id: 1, form_title: "F1", employee_id: "E1", department: "Eng", deadline_at: "2026-08-01T00:00:00.000Z", response_status: "submitted", submitted_at: "2026-07-30T00:00:00.000Z" },
            // submitted after deadline -> late
            { distribution_id: 2, form_id: 1, form_title: "F1", employee_id: "E2", department: "Eng", deadline_at: "2026-07-01T00:00:00.000Z", response_status: "submitted", submitted_at: "2026-07-15T00:00:00.000Z" },
            // not submitted, deadline passed -> overdue
            { distribution_id: 3, form_id: 1, form_title: "F1", employee_id: "E3", department: "Eng", deadline_at: "2026-07-01T00:00:00.000Z", response_status: null, submitted_at: null },
            // not submitted, no deadline -> pending
            { distribution_id: 4, form_id: 1, form_title: "F1", employee_id: "E4", department: "Eng", deadline_at: null, response_status: null, submitted_at: null },
          ],
        }) // forms
        .mockResolvedValueOnce({ rows: [] }) // comms
        .mockResolvedValueOnce({ rows: [] }) // employees list
        .mockResolvedValueOnce({ rows: [] }) // forms options
        .mockResolvedValueOnce({ rows: [] }) // comms options
        .mockResolvedValueOnce({ rows: [] }); // dept options

      const result = await service.getSubmissionsBreakdown({});
      const statuses = result.formsBreakdown.map((f: any) => f.status);
      expect(statuses).toEqual(["on_time", "late", "overdue", "pending"]);
      expect(result.summary.forms.totalAssigned).toBe(4);
      expect(result.summary.forms.onTimeCount).toBe(1);
    });

    it("filters by status and search term across both forms and comms", async () => {
      poolQueryMock
        .mockResolvedValueOnce({
          rows: [
            { distribution_id: 1, form_id: 1, form_title: "Survey", employee_id: "E1", department: "Eng", deadline_at: null, response_status: null, submitted_at: null },
            { distribution_id: 2, form_id: 1, form_title: "Onboarding", employee_id: "E2", department: "Eng", deadline_at: null, response_status: null, submitted_at: null },
          ],
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await service.getSubmissionsBreakdown({ status: "pending", search: "survey" });
      expect(result.formsBreakdown).toHaveLength(1);
      expect(result.formsBreakdown[0].formTitle).toBe("Survey");
    });

    it("computes per-user compliance rate combining forms and communications", async () => {
      poolQueryMock
        .mockResolvedValueOnce({
          rows: [
            { distribution_id: 1, form_id: 1, form_title: "F1", employee_id: "E1", department: "Eng", deadline_at: null, response_status: "submitted", submitted_at: "2026-01-01T00:00:00.000Z" },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            { recipient_id: 1, communication_id: 1, communication_title: "C1", employee_id: "E1", department: "Eng", deadline_at: null, responded_at: null },
          ],
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await service.getSubmissionsBreakdown({});
      expect(result.userBreakdown).toHaveLength(1);
      const user = result.userBreakdown[0];
      expect(user.forms.total).toBe(1);
      expect(user.communications.total).toBe(1);
      // 1 on-time (the form) out of 2 total items = 50%
      expect(user.complianceRate).toBe(50);
    });
  });

  describe("workbook builders", () => {
    it("buildLeaveReportWorkbook creates one worksheet with a row per record", () => {
      const workbook = service.buildLeaveReportWorkbook([
        { employee_id: "E1", first_name: "A", last_name: "B", department: "Eng", leave_type_name: "Annual", start_date: "2026-01-01", end_date: "2026-01-02", total_days: 2, status: "approved", reason: "trip", created_at: "2026-01-01" },
      ]);
      const ws = workbook.getWorksheet("Leave Report");
      expect(ws).toBeDefined();
      expect(ws!.rowCount).toBe(2); // header + 1 data row
    });

    it("buildSalaryReportWorkbook creates one worksheet with a row per record", () => {
      const workbook = service.buildSalaryReportWorkbook([
        { employee_id: "E1", first_name: "A", last_name: "B", department: "Eng", month_year: "2026-01-01", basic_salary: "1000", total_earnings: "1200", total_deductions: "100", net_salary: "1100", status: "paid" },
      ]);
      const ws = workbook.getWorksheet("Salary Report");
      expect(ws!.rowCount).toBe(2);
    });

    it("buildSubmissionsBreakdownWorkbook creates three worksheets", () => {
      const workbook = service.buildSubmissionsBreakdownWorkbook({
        formsBreakdown: [{ employeeId: "E1", employeeName: "A B", department: "Eng", formTitle: "F1", distributedAt: null, deadlineAt: null, submittedAt: null, status: "on_time" }],
        communicationsBreakdown: [{ employeeId: "E1", employeeName: "A B", department: "Eng", communicationTitle: "C1", emailSentAt: null, deadlineAt: null, respondedAt: null, status: "pending", responseText: null }],
        userBreakdown: [{ employeeId: "E1", employeeName: "A B", department: "Eng", forms: { total: 1, onTime: 1, late: 0, overdue: 0, pending: 0 }, communications: { total: 1, onTime: 0, late: 0, overdue: 0, pending: 1 }, complianceRate: 50 }],
      });
      expect(workbook.getWorksheet("Forms Submissions")).toBeDefined();
      expect(workbook.getWorksheet("Communications")).toBeDefined();
      expect(workbook.getWorksheet("User Compliance Summary")).toBeDefined();
    });
  });
});
