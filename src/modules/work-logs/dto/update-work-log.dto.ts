import { WorkLogEntryDto } from './submit-work-logs.dto';

// Same shape as a fresh submission - editing a work log resubmits every
// field, subject to the same validation (see OCD-464).
export class UpdateWorkLogDto extends WorkLogEntryDto {}
