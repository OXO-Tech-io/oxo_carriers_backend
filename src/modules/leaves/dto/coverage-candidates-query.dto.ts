import { IsOptional, Matches } from 'class-validator';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// startDate/endDate must both be present to filter by availability - if
// either is missing, listCoverageCandidates skips the overlap check
// entirely and returns every active colleague, as before.
export class CoverageCandidatesQueryDto {
  @IsOptional()
  @Matches(ISO_DATE, { message: 'startDate must be in YYYY-MM-DD format' })
  startDate?: string;

  @IsOptional()
  @Matches(ISO_DATE, { message: 'endDate must be in YYYY-MM-DD format' })
  endDate?: string;
}
