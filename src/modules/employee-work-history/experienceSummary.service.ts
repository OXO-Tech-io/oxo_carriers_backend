import { EmployeeWorkHistoryModel } from './EmployeeWorkHistory';
import { EmployeeModel } from '../../employees/Employee';
import { NotFoundError } from '../../utils/AppError';

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

export interface ExperienceSummary {
  totalExperienceYears: number;
  totalExperienceExclInternshipYears: number;
  postDegreeExperienceYears: number;
  postDegreeExperienceExclInternshipYears: number;
  hasDegreeDate: boolean;
}

// Simple sequential summation over work-history date ranges - does not merge
// overlapping intervals (e.g. two concurrent roles), so total experience for
// employees with overlapping entries will be an over-count. Acceptable for a
// first pass; revisit if concurrent-role data becomes common.
export const experienceSummaryService = {
  async calculate(employeeId: string): Promise<ExperienceSummary> {
    const user = await EmployeeModel.findByEmployeeId(employeeId);
    if (!user) throw new NotFoundError('User not found');

    const workHistory = await EmployeeWorkHistoryModel.listByEmployeeId(employeeId);
    const degreeDate = user.undergraduateDegreeCompletionDate
      ? new Date(user.undergraduateDegreeCompletionDate)
      : null;
    const now = new Date();

    let totalExperience = 0;
    let totalExperienceExclInternship = 0;
    let postDegreeExperience = 0;
    let postDegreeExperienceExclInternship = 0;

    for (const entry of workHistory) {
      const start = new Date(entry.startDate);
      const end = entry.endDate ? new Date(entry.endDate) : now;
      if (end <= start) continue;

      const isRegular = entry.employmentType === 'regular';
      const durationYears = (end.getTime() - start.getTime()) / MS_PER_YEAR;

      totalExperience += durationYears;
      if (isRegular) totalExperienceExclInternship += durationYears;

      if (degreeDate) {
        const clampedStart = start < degreeDate ? degreeDate : start;
        if (clampedStart < end) {
          const postDegreeYears = (end.getTime() - clampedStart.getTime()) / MS_PER_YEAR;
          postDegreeExperience += postDegreeYears;
          if (isRegular) postDegreeExperienceExclInternship += postDegreeYears;
        }
      }
    }

    const round2 = (n: number) => Math.round(n * 100) / 100;

    return {
      totalExperienceYears: round2(totalExperience),
      totalExperienceExclInternshipYears: round2(totalExperienceExclInternship),
      postDegreeExperienceYears: round2(postDegreeExperience),
      postDegreeExperienceExclInternshipYears: round2(postDegreeExperienceExclInternship),
      hasDegreeDate: !!degreeDate,
    };
  },
};
