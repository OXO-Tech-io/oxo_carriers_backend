import { EmployeeWorkHistoryModel } from './EmployeeWorkHistory';
import { EmployeeEducationModel } from '../employee-education/EmployeeEducation';
import { EmployeeModel } from '../../employees/Employee';
import { NotFoundError } from '../../utils/AppError';
import { CAREER_PATHS, CareerPath } from '../../common/constants/careerPaths';
import {
  DayRange,
  Duration,
  ZERO_DURATION,
  clampFrom,
  dayToYmd,
  durationOf,
  entryToRange,
  graduationMonthStart,
  toYmd,
  ymdToDay,
} from './experienceCalculator';

export type DegreeDateSource = 'education' | 'profile';

export interface ExperienceSummary {
  /** All work experience, internships and pre-degree work included. */
  total: Duration;
  totalExclInternship: Duration;
  /** From the first-degree graduation month onwards; career breaks never count. */
  postDegree: Duration;
  postDegreeExclInternship: Duration;
  hasDegreeDate: boolean;
  /** YYYY-MM-01 of the first degree's graduation month. */
  degreeCompletionDate: string | null;
  degreeDateSource: DegreeDateSource | null;
  /** Career path of the employee's current designation (null if not set). */
  currentCareerPath: CareerPath | null;
  /** Experience per career path - lets the UI switch path without a refetch. */
  byCareerPath: Record<CareerPath, Duration>;
  entryCount: number;
  /** Work-history entries with no career path (excluded from every byCareerPath figure). */
  uncategorizedEntryCount: number;
  asOf: string;
}

// First degree = the earliest-awarded completed Bachelor's degree, from the
// Educational Qualifications section (month + year of graduation). Falls back
// to the profile-level Undergraduate Degree Completion Date for records that
// have no such education entry.
function resolveDegreeDate(
  education: { qualificationLevel: string; isOngoing: boolean | null; dateAwarded: unknown }[],
  profileFallback: unknown,
): { date: string | null; source: DegreeDateSource | null } {
  const fromEducation = education
    .filter((e) => e.qualificationLevel === 'degree' && !e.isOngoing)
    .map((e) => graduationMonthStart(e.dateAwarded))
    .filter((d): d is string => !!d)
    .sort();
  if (fromEducation.length > 0) return { date: fromEducation[0], source: 'education' };
  const fallback = graduationMonthStart(profileFallback);
  return fallback ? { date: fallback, source: 'profile' } : { date: null, source: null };
}

export const experienceSummaryService = {
  async calculate(employeeId: string): Promise<ExperienceSummary> {
    const user = await EmployeeModel.findByEmployeeId(employeeId);
    if (!user) throw new NotFoundError('User not found');

    const [workHistory, education] = await Promise.all([
      EmployeeWorkHistoryModel.listByEmployeeId(employeeId),
      EmployeeEducationModel.listByEmployeeId(employeeId),
    ]);

    const todayYmd = toYmd(new Date())!;
    const today = ymdToDay(todayYmd);

    const { date: degreeCompletionDate, source: degreeDateSource } = resolveDegreeDate(
      education,
      user.undergraduateDegreeCompletionDate,
    );
    const degreeDay = degreeCompletionDate ? ymdToDay(degreeCompletionDate) : null;

    const allRanges: DayRange[] = [];
    const regular: DayRange[] = [];
    const rangesByPath = new Map<string, DayRange[]>();
    let uncategorizedEntryCount = 0;

    for (const entry of workHistory) {
      const range = entryToRange(entry, today);
      if (!range) continue;
      allRanges.push(range);
      if (entry.employmentType !== 'intern') regular.push(range);
      if (entry.careerPath) {
        const list = rangesByPath.get(entry.careerPath) ?? [];
        list.push(range);
        rangesByPath.set(entry.careerPath, list);
      } else {
        uncategorizedEntryCount += 1;
      }
    }

    const byCareerPath = {} as Record<CareerPath, Duration>;
    for (const path of CAREER_PATHS) {
      byCareerPath[path] = rangesByPath.has(path) ? durationOf(rangesByPath.get(path)!) : ZERO_DURATION;
    }

    const currentCareerPath = (CAREER_PATHS as readonly string[]).includes(user.careerPath ?? '')
      ? (user.careerPath as CareerPath)
      : null;

    return {
      total: durationOf(allRanges),
      totalExclInternship: durationOf(regular),
      postDegree: degreeDay === null ? ZERO_DURATION : durationOf(clampFrom(allRanges, degreeDay)),
      postDegreeExclInternship: degreeDay === null ? ZERO_DURATION : durationOf(clampFrom(regular, degreeDay)),
      hasDegreeDate: degreeDay !== null,
      degreeCompletionDate,
      degreeDateSource,
      currentCareerPath,
      byCareerPath,
      entryCount: allRanges.length,
      uncategorizedEntryCount,
      asOf: dayToYmd(today),
    };
  },
};
