import { registerDecorator, ValidationArguments, ValidationOptions } from 'class-validator';

/**
 * OCD-565: cross-field check for the notice scheduling window - `endAt` must
 * be strictly after `startAt` when both are present on the same payload.
 *
 * This only catches the case where the caller supplies both fields together
 * in one request (always true for CreateNoticeDto, where startAt is
 * required; sometimes true for UpdateNoticeDto). A PATCH that only changes
 * one of the two fields against an existing row can't be validated here -
 * the other value simply isn't in the payload - so
 * NoticesService.assertValidWindow() re-checks the merged, resolved values
 * as the authoritative guard for partial updates.
 */
export function IsAfterStartAt(startAtProperty: string, validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isAfterStartAt',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [startAtProperty],
      validator: {
        validate(endAtValue: unknown, args: ValidationArguments) {
          const [relatedProperty] = args.constraints as [string];
          const startAtValue = (args.object as Record<string, unknown>)[relatedProperty];

          // Nothing to compare against - presence/format of each field is
          // @IsOptional()/@IsDateString()'s job, not this decorator's.
          if (endAtValue === undefined || endAtValue === null || endAtValue === '') return true;
          if (startAtValue === undefined || startAtValue === null || startAtValue === '') return true;

          const start = new Date(startAtValue as string).getTime();
          const end = new Date(endAtValue as string).getTime();
          if (Number.isNaN(start) || Number.isNaN(end)) return true; // malformed dates are @IsDateString's job

          return end > start;
        },
        defaultMessage(args: ValidationArguments) {
          const [relatedProperty] = args.constraints as [string];
          return `${args.property} must be after ${relatedProperty}`;
        },
      },
    });
  };
}
